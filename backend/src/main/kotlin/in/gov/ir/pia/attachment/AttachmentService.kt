package `in`.gov.ir.pia.attachment

import `in`.gov.ir.pia.config.MinioProperties
import `in`.gov.ir.pia.domain.attachment.Attachment
import `in`.gov.ir.pia.repository.AttachmentRepository
import `in`.gov.ir.pia.security.Principal
import io.minio.GetPresignedObjectUrlArgs
import io.minio.MinioClient
import io.minio.PutObjectArgs
import io.minio.http.Method
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.multipart.MultipartFile
import org.springframework.web.server.ResponseStatusException
import java.io.IOException
import java.net.Socket
import java.nio.ByteBuffer
import java.time.Instant
import java.util.UUID
import java.util.concurrent.TimeUnit

// ── DTOs ─────────────────────────────────────────────────────────────────────

data class AttachmentDto(
    val id: UUID,
    val entityType: String,
    val entityId: UUID,
    val originalFilename: String,
    val contentType: String,
    val fileSizeBytes: Long,
    val scanStatus: String,
    val createdAt: Instant,
    val uploadedByUserId: UUID,
)

data class AttachmentDownloadDto(
    val presignedUrl: String,
    val originalFilename: String,
    val contentType: String,
)

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * Handles file upload (multipart → ClamAV scan → MinIO commit), presigned
 * download URL generation, and soft-delete.
 *
 * ClamAV scan is blocking: if the sidecar returns FOUND the upload is rejected
 * immediately and no row is written.  Infected files are dropped — they are
 * never committed to MinIO.
 *
 * Allowed content types and max size are enforced here; the DB constraint is
 * intentionally loose to allow future types without a migration.
 */
@Service
@Transactional
class AttachmentService(
    private val attachmentRepo: AttachmentRepository,
    private val minioClient: MinioClient,
    private val minioProps: MinioProperties,
    @Value("\${pia.clamav.host:clamav}") private val clamavHost: String,
    @Value("\${pia.clamav.port:3310}") private val clamavPort: Int,
    @Value("\${pia.clamav.timeout-ms:30000}") private val clamavTimeoutMs: Int,
    @Value("\${pia.attachments.max-bytes:50331648}") private val maxBytes: Long,
) {
    private val log = LoggerFactory.getLogger(AttachmentService::class.java)

    private val allowedContentTypes = setOf("application/pdf")

    companion object {
        private const val BYTES_PER_MB = 1_048_576L
    }

    // ── Upload ────────────────────────────────────────────────────────────────

    fun upload(
        entityType: String,
        entityId: UUID,
        file: MultipartFile,
        actor: Principal,
    ): AttachmentDto {
        val contentType = file.contentType ?: "application/octet-stream"
        if (contentType !in allowedContentTypes) {
            throw ResponseStatusException(
                HttpStatus.UNSUPPORTED_MEDIA_TYPE,
                "Content type '$contentType' is not allowed. Allowed: $allowedContentTypes",
            )
        }
        if (file.size > maxBytes) {
            throw ResponseStatusException(
                HttpStatus.PAYLOAD_TOO_LARGE,
                "File exceeds the maximum allowed size of ${maxBytes / BYTES_PER_MB} MB",
            )
        }

        val bytes = file.bytes
        scanWithClamAv(bytes)

        val objectKey = buildObjectKey(entityType, entityId, file.originalFilename ?: "upload.pdf")
        minioClient.putObject(
            PutObjectArgs
                .builder()
                .bucket(minioProps.bucketAttachments)
                .`object`(objectKey)
                .stream(bytes.inputStream(), bytes.size.toLong(), -1)
                .contentType(contentType)
                .build(),
        )

        val attachment =
            attachmentRepo.save(
                Attachment(
                    entityType = entityType,
                    entityId = entityId,
                    uploadedByUserId = actor.userId,
                    originalFilename = file.originalFilename ?: "upload.pdf",
                    contentType = contentType,
                    fileSizeBytes = bytes.size.toLong(),
                    objectKey = objectKey,
                    scanStatus = "CLEAN",
                ),
            )
        return attachment.toDto()
    }

    // ── List ──────────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    fun list(
        entityType: String,
        entityId: UUID,
    ): List<AttachmentDto> =
        attachmentRepo
            .findByEntityTypeAndEntityIdOrderByCreatedAtDesc(entityType, entityId)
            .map { it.toDto() }

    // ── Download (presigned URL) ───────────────────────────────────────────────

    @Transactional(readOnly = true)
    fun presignedDownloadUrl(id: UUID): AttachmentDownloadDto {
        val attachment =
            attachmentRepo.findById(id).orElseThrow {
                ResponseStatusException(HttpStatus.NOT_FOUND, "Attachment $id not found")
            }
        val url =
            minioClient.getPresignedObjectUrl(
                GetPresignedObjectUrlArgs
                    .builder()
                    .method(Method.GET)
                    .bucket(minioProps.bucketAttachments)
                    .`object`(attachment.objectKey)
                    .expiry(15, TimeUnit.MINUTES)
                    .build(),
            )
        return AttachmentDownloadDto(
            presignedUrl = url,
            originalFilename = attachment.originalFilename,
            contentType = attachment.contentType,
        )
    }

    // ── Delete (soft) ─────────────────────────────────────────────────────────

    fun delete(
        id: UUID,
        actor: Principal,
        canDeleteAny: Boolean,
    ) {
        val attachment =
            attachmentRepo.findById(id).orElseThrow {
                ResponseStatusException(HttpStatus.NOT_FOUND, "Attachment $id not found")
            }
        if (!canDeleteAny && attachment.uploadedByUserId != actor.userId) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Cannot delete another user's attachment")
        }
        attachment.isDeleted = true
        attachment.deletedAt = Instant.now()
        attachment.deletedByUserId = actor.userId
        attachmentRepo.save(attachment)
    }

    // ── ClamAV ────────────────────────────────────────────────────────────────

    /**
     * Streams bytes to ClamAV and rejects the upload if the scanner returns FOUND.
     *
     * Throws [ResponseStatusException] 422 on infected file, 503 if the scanner
     * is unreachable — enforcing the fail-closed, scan-mandatory policy.
     */
    private fun scanWithClamAv(bytes: ByteArray) {
        val response = performClamAvScan(bytes)
        if (response.contains("FOUND")) {
            throw ResponseStatusException(
                HttpStatus.UNPROCESSABLE_ENTITY,
                "File failed malware scan and was rejected",
            )
        }
    }

    /**
     * Opens a TCP connection to clamd, sends the INSTREAM command, and returns
     * the raw response line.
     *
     * Uses the n-prefix protocol (newline-terminated command) which is
     * equivalent to the z-prefix (null-terminated command):
     *   "nINSTREAM\n" → <4-byte big-endian chunk length><data> → <0-length chunk>
     * Response: "stream: OK" or "stream: {virus-name} FOUND"
     *
     * Throws [ResponseStatusException] 503 on any [IOException] so that a missing
     * or unreachable scanner always blocks the upload (fail-closed).
     */
    private fun performClamAvScan(bytes: ByteArray): String {
        try {
            Socket(clamavHost, clamavPort).use { socket ->
                socket.soTimeout = clamavTimeoutMs
                val out = socket.getOutputStream()
                val responseIn = socket.getInputStream()

                // n-prefix commands are newline-terminated; clamd processes them
                // identically to z-prefix (null-terminated) commands.
                out.write("nINSTREAM\n".toByteArray(Charsets.UTF_8))
                // 4-byte big-endian content length, then the payload
                out.write(ByteBuffer.allocate(Int.SIZE_BYTES).putInt(bytes.size).array())
                out.write(bytes)
                // Zero-length chunk signals end of INSTREAM to clamd
                out.write(ByteArray(Int.SIZE_BYTES))
                out.flush()

                val response = responseIn.bufferedReader(Charsets.UTF_8).readLine() ?: ""
                log.debug("ClamAV response: {}", response)
                return response
            }
        } catch (e: IOException) {
            log.error("ClamAV scan failed: {}. Rejecting upload.", e.message)
            throw ResponseStatusException(
                HttpStatus.SERVICE_UNAVAILABLE,
                "Malware scanner is unavailable — upload rejected",
            )
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private fun buildObjectKey(
        entityType: String,
        entityId: UUID,
        filename: String,
    ): String {
        val sanitized = filename.replace(Regex("[^a-zA-Z0-9._-]"), "_")
        return "${entityType.lowercase()}/$entityId/${UUID.randomUUID()}_$sanitized"
    }

    private fun Attachment.toDto() =
        AttachmentDto(
            id = id,
            entityType = entityType,
            entityId = entityId,
            originalFilename = originalFilename,
            contentType = contentType,
            fileSizeBytes = fileSizeBytes,
            scanStatus = scanStatus,
            createdAt = createdAt,
            uploadedByUserId = uploadedByUserId,
        )
}
