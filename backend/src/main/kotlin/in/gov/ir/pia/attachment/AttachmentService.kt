package `in`.gov.ir.pia.attachment

import `in`.gov.ir.pia.config.MinioProperties
import `in`.gov.ir.pia.domain.attachment.Attachment
import `in`.gov.ir.pia.repository.AttachmentRepository
import `in`.gov.ir.pia.security.Principal
import io.minio.GetObjectArgs
import io.minio.GetPresignedObjectUrlArgs
import io.minio.PiaMinioClient
import io.minio.RemoveObjectArgs
import io.minio.http.Method
import io.minio.messages.Part
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.scheduling.annotation.Async
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import java.io.IOException
import java.io.InputStream
import java.net.Socket
import java.nio.ByteBuffer
import java.security.MessageDigest
import java.time.Instant
import java.util.UUID
import java.util.concurrent.TimeUnit

// ── DTOs ──────────────────────────────────────────────────────────────────────

data class AttachmentDto(
    val id: UUID,
    val entityType: String,
    val entityId: UUID,
    val originalFilename: String,
    val contentType: String,
    val fileSizeBytes: Long,
    val scanStatus: String,
    val sha256: String?,
    val createdAt: Instant,
    val uploadedByUserId: UUID,
)

data class AttachmentDownloadDto(
    val presignedUrl: String,
    val originalFilename: String,
    val contentType: String,
)

data class InitiateUploadRequest(
    val entityType: String,
    val entityId: UUID,
    val filename: String,
    val contentType: String,
    val sizeBytes: Long,
)

data class InitiateUploadResponse(
    val attachmentId: UUID,
    val presignedUrl: String,
    val expiresAt: Instant,
)

data class InitiateMultipartResponse(
    val attachmentId: UUID,
    val uploadId: String,
    val parts: List<PresignedPart>,
)

data class PresignedPart(
    val partNumber: Int,
    val presignedUrl: String,
)

data class CompleteMultipartRequest(
    val parts: List<CompletedPart>,
)

data class CompletedPart(
    val partNumber: Int,
    val etag: String,
)

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * Presigned-URL upload flow — Spring never touches file bytes:
 *
 *  Single-part (≤ 100 MB):
 *   1. [initiate]          — validate, write PENDING row, return presigned PUT URL.
 *   2. Browser PUTs directly to MinIO.
 *   3. [confirm]           — flip to SCANNING, enqueue async ClamAV scan.
 *
 *  Multipart (> 100 MB, up to 10 GB):
 *   1. [initiateMultipart] — start MinIO multipart, return per-part presigned URLs.
 *   2. Browser uploads each part directly to MinIO.
 *   3. [completeMultipart] — assemble parts on MinIO, enqueue async scan.
 *
 *  Scan (async, never blocks the HTTP response):
 *   - REQUIRED (< 2 GB, non-video): 8 MB streamed chunks through ClamAV → CLEAN / INFECTED.
 *   - EXEMPT   (≥ 2 GB or video):   SHA-256 stored for integrity, status set to EXEMPT.
 */
@Service
@Transactional
class AttachmentService(
    private val attachmentRepo: AttachmentRepository,
    private val minioClient: PiaMinioClient,
    private val minioProps: MinioProperties,
    @Value("\${pia.clamav.host:clamav}") private val clamavHost: String,
    @Value("\${pia.clamav.port:3310}") private val clamavPort: Int,
    @Value("\${pia.clamav.timeout-ms:30000}") private val clamavTimeoutMs: Int,
    @Value("\${pia.attachments.max-bytes:10737418240}") private val maxBytes: Long,
    @Value("\${pia.attachments.presign-expiry-minutes:60}") private val presignExpiryMinutes: Long,
    @Value("\${pia.attachments.multipart-part-size-bytes:104857600}") private val partSizeBytes: Long,
    @Value("\${pia.attachments.scan-exempt-above-bytes:2147483648}") private val scanExemptAboveBytes: Long,
) {
    private val log = LoggerFactory.getLogger(AttachmentService::class.java)

    companion object {
        private const val SCAN_CHUNK_BYTES = 8 * 1024 * 1024
        private const val INSTREAM_FRAME_BYTES = 4 // ClamAV INSTREAM: 4-byte big-endian length prefix
        private const val SECONDS_PER_MINUTE = 60L
        private const val BYTES_PER_MB = 1_048_576L
        private const val DOWNLOAD_PRESIGN_MINUTES = 15
    }

    // ── Single-part ───────────────────────────────────────────────────────────

    fun initiate(
        request: InitiateUploadRequest,
        actor: Principal,
    ): InitiateUploadResponse {
        validateRequest(request.contentType, request.sizeBytes)
        val objectKey = buildObjectKey(request.entityType, request.entityId, request.filename)

        val attachment =
            attachmentRepo.save(
                Attachment(
                    entityType = request.entityType,
                    entityId = request.entityId,
                    uploadedByUserId = actor.userId,
                    originalFilename = sanitizeFilename(request.filename),
                    contentType = request.contentType,
                    fileSizeBytes = request.sizeBytes,
                    objectKey = objectKey,
                    scanStatus = "PENDING",
                ),
            )

        val presignedUrl =
            minioClient.getPresignedObjectUrl(
                GetPresignedObjectUrlArgs
                    .builder()
                    .method(Method.PUT)
                    .bucket(minioProps.bucketAttachments)
                    .`object`(objectKey)
                    .expiry(presignExpiryMinutes.toInt(), TimeUnit.MINUTES)
                    .build(),
            )

        return InitiateUploadResponse(
            attachmentId = attachment.id,
            presignedUrl = presignedUrl,
            expiresAt = Instant.now().plusSeconds(presignExpiryMinutes * SECONDS_PER_MINUTE),
        )
    }

    fun confirm(
        id: UUID,
        actor: Principal,
    ): AttachmentDto {
        val attachment = findOrThrow(id)
        requireOwnerAndPending(attachment, actor)
        attachment.scanStatus = "SCANNING"
        attachmentRepo.save(attachment)
        if (isExempt(attachment)) scanExemptAsync(id) else scanAsync(id)
        return attachment.toDto()
    }

    // ── Multipart ─────────────────────────────────────────────────────────────

    fun initiateMultipart(
        request: InitiateUploadRequest,
        actor: Principal,
    ): InitiateMultipartResponse {
        validateRequest(request.contentType, request.sizeBytes)
        val objectKey = buildObjectKey(request.entityType, request.entityId, request.filename)

        val uploadId =
            runCatching { minioClient.piaCreateMultipartUpload(minioProps.bucketAttachments, objectKey) }
                .getOrElse { throw ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to initiate multipart upload") }
        val partCount = ((request.sizeBytes + partSizeBytes - 1) / partSizeBytes).toInt()
        val parts =
            (1..partCount).map { n ->
                PresignedPart(
                    partNumber = n,
                    presignedUrl =
                        minioClient.getPresignedObjectUrl(
                            GetPresignedObjectUrlArgs
                                .builder()
                                .method(Method.PUT)
                                .bucket(minioProps.bucketAttachments)
                                .`object`(objectKey)
                                .expiry(presignExpiryMinutes.toInt(), TimeUnit.MINUTES)
                                .extraQueryParams(mapOf("partNumber" to n.toString(), "uploadId" to uploadId))
                                .build(),
                        ),
                )
            }

        val attachment =
            attachmentRepo.save(
                Attachment(
                    entityType = request.entityType,
                    entityId = request.entityId,
                    uploadedByUserId = actor.userId,
                    originalFilename = sanitizeFilename(request.filename),
                    contentType = request.contentType,
                    fileSizeBytes = request.sizeBytes,
                    objectKey = objectKey,
                    scanStatus = "PENDING",
                    multipartUploadId = uploadId,
                ),
            )
        return InitiateMultipartResponse(attachment.id, uploadId, parts)
    }

    fun completeMultipart(
        id: UUID,
        request: CompleteMultipartRequest,
        actor: Principal,
    ): AttachmentDto {
        val attachment = findOrThrow(id)
        requireOwnerAndPending(attachment, actor)
        val uploadId = requireMultipartId(attachment)

        runCatching {
            minioClient.piaCompleteMultipartUpload(
                minioProps.bucketAttachments,
                attachment.objectKey,
                uploadId,
                request.parts.map { Part(it.partNumber, it.etag) }.toTypedArray(),
            )
        }.getOrElse { throw ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to complete multipart upload") }

        attachment.scanStatus = "SCANNING"
        attachment.multipartUploadId = null
        attachmentRepo.save(attachment)
        if (isExempt(attachment)) scanExemptAsync(id) else scanAsync(id)
        return attachment.toDto()
    }

    // ── List / Download / Delete ──────────────────────────────────────────────

    @Transactional(readOnly = true)
    fun list(
        entityType: String,
        entityId: UUID,
    ): List<AttachmentDto> =
        attachmentRepo
            .findByEntityTypeAndEntityIdOrderByCreatedAtDesc(entityType, entityId)
            .map { it.toDto() }

    @Transactional(readOnly = true)
    fun presignedDownloadUrl(id: UUID): AttachmentDownloadDto {
        val attachment = findOrThrow(id)
        val url =
            minioClient.getPresignedObjectUrl(
                GetPresignedObjectUrlArgs
                    .builder()
                    .method(Method.GET)
                    .bucket(minioProps.bucketAttachments)
                    .`object`(attachment.objectKey)
                    .expiry(DOWNLOAD_PRESIGN_MINUTES, TimeUnit.MINUTES)
                    .build(),
            )
        return AttachmentDownloadDto(url, attachment.originalFilename, attachment.contentType)
    }

    fun delete(
        id: UUID,
        actor: Principal,
        canDeleteAny: Boolean,
    ) {
        val attachment = findOrThrow(id)
        if (!canDeleteAny && attachment.uploadedByUserId != actor.userId) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Cannot delete another user's attachment")
        }
        attachment.isDeleted = true
        attachment.deletedAt = Instant.now()
        attachment.deletedByUserId = actor.userId
        attachmentRepo.save(attachment)
    }

    // ── Async: ClamAV scan (streamed, 8 MB chunks) ────────────────────────────

    @Async("piaAsync")
    fun scanAsync(id: UUID) {
        val attachment = attachmentRepo.findById(id).orElse(null) ?: return
        log.info("ClamAV scan starting: attachment={}", id)

        val newStatus =
            runCatching {
                minioClient
                    .getObject(
                        GetObjectArgs
                            .builder()
                            .bucket(minioProps.bucketAttachments)
                            .`object`(attachment.objectKey)
                            .build(),
                    ).use { stream -> clamAvScan(stream) }
            }.fold(
                onSuccess = { response ->
                    if (response.contains("FOUND")) {
                        log.warn("Infected file — removing from MinIO: attachment={}", id)
                        minioClient.removeObject(
                            RemoveObjectArgs
                                .builder()
                                .bucket(minioProps.bucketAttachments)
                                .`object`(attachment.objectKey)
                                .build(),
                        )
                        "INFECTED"
                    } else {
                        "CLEAN"
                    }
                },
                onFailure = { ex ->
                    log.error("ClamAV scan error: attachment={} msg={}", id, ex.message)
                    "SCAN_FAILED"
                },
            )

        attachmentRepo.findById(id).ifPresent { a ->
            a.scanStatus = newStatus
            attachmentRepo.save(a)
        }
        log.info("ClamAV scan complete: attachment={} status={}", id, newStatus)
    }

    // ── Async: exempt — store SHA-256 for integrity ───────────────────────────

    @Async("piaAsync")
    fun scanExemptAsync(id: UUID) {
        val attachment = attachmentRepo.findById(id).orElse(null) ?: return
        log.info("Computing SHA-256 for exempt attachment={}", id)

        val sha256 =
            runCatching {
                minioClient
                    .getObject(
                        GetObjectArgs
                            .builder()
                            .bucket(minioProps.bucketAttachments)
                            .`object`(attachment.objectKey)
                            .build(),
                    ).use { sha256Hex(it) }
            }.getOrNull()

        attachmentRepo.findById(id).ifPresent { a ->
            a.scanStatus = "EXEMPT"
            a.sha256 = sha256
            attachmentRepo.save(a)
        }
        log.info("SHA-256 stored for exempt attachment={}", id)
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private fun clamAvScan(stream: InputStream): String {
        try {
            Socket(clamavHost, clamavPort).use { socket ->
                socket.soTimeout = clamavTimeoutMs
                val out = socket.getOutputStream()
                out.write("nINSTREAM\n".toByteArray(Charsets.UTF_8))
                val buf = ByteArray(SCAN_CHUNK_BYTES)
                var read: Int
                while (stream.read(buf).also { read = it } != -1) {
                    out.write(ByteBuffer.allocate(INSTREAM_FRAME_BYTES).putInt(read).array())
                    out.write(buf, 0, read)
                }
                out.write(ByteArray(INSTREAM_FRAME_BYTES)) // zero-length chunk = end of INSTREAM
                out.flush()
                return socket.getInputStream().bufferedReader(Charsets.UTF_8).readLine() ?: ""
            }
        } catch (e: IOException) {
            log.error("ClamAV connection failed: {}", e.message)
            throw ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Malware scanner unavailable")
        }
    }

    private fun sha256Hex(stream: InputStream): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val buf = ByteArray(SCAN_CHUNK_BYTES)
        var read: Int
        while (stream.read(buf).also { read = it } != -1) digest.update(buf, 0, read)
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    private fun isExempt(a: Attachment) =
        a.fileSizeBytes > scanExemptAboveBytes ||
            AllowedContentTypes.scanPolicy(a.contentType) == AllowedContentTypes.ScanPolicy.EXEMPT

    private fun validateRequest(
        contentType: String,
        sizeBytes: Long,
    ) {
        if (contentType !in AllowedContentTypes.ALL) {
            throw ResponseStatusException(
                HttpStatus.UNSUPPORTED_MEDIA_TYPE,
                "Content type '$contentType' is not allowed",
            )
        }
        if (sizeBytes > maxBytes) {
            throw ResponseStatusException(
                HttpStatus.PAYLOAD_TOO_LARGE,
                "File size ${sizeBytes / BYTES_PER_MB} MB exceeds the ${maxBytes / BYTES_PER_MB} MB limit",
            )
        }
    }

    private fun requireOwnerAndPending(
        attachment: Attachment,
        actor: Principal,
    ) {
        if (attachment.uploadedByUserId != actor.userId) throw ResponseStatusException(HttpStatus.FORBIDDEN)
        if (attachment.scanStatus != "PENDING") throw ResponseStatusException(HttpStatus.CONFLICT, "Upload already confirmed")
    }

    private fun requireMultipartId(attachment: Attachment): String =
        attachment.multipartUploadId
            ?: throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Not a multipart upload")

    private fun findOrThrow(id: UUID): Attachment =
        attachmentRepo.findById(id).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Attachment $id not found")
        }

    private fun buildObjectKey(
        entityType: String,
        entityId: UUID,
        filename: String,
    ): String = "${entityType.lowercase()}/$entityId/${UUID.randomUUID()}_${sanitizeFilename(filename)}"

    private fun sanitizeFilename(filename: String): String = filename.replace(Regex("[^a-zA-Z0-9._\\-() ]"), "_").trim()

    private fun Attachment.toDto() =
        AttachmentDto(
            id = id,
            entityType = entityType,
            entityId = entityId,
            originalFilename = originalFilename,
            contentType = contentType,
            fileSizeBytes = fileSizeBytes,
            scanStatus = scanStatus,
            sha256 = sha256,
            createdAt = createdAt,
            uploadedByUserId = uploadedByUserId,
        )
}
