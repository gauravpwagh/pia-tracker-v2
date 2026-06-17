package `in`.gov.ir.pia.attachment

import `in`.gov.ir.pia.config.MinioProperties
import `in`.gov.ir.pia.repository.AttachmentRepository
import io.minio.MinioClient
import io.minio.RemoveObjectArgs
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.time.temporal.ChronoUnit

/**
 * Deletes attachment rows that are stuck in PENDING status because the browser
 * closed before the upload completed (presigned URL was obtained but the PUT
 * never happened, so no object exists in MinIO).
 *
 * Runs every 6 hours; cleans rows older than 2 hours.  The 2-hour window is
 * generous relative to the presigned URL expiry (60 min), so any legitimately
 * in-flight upload for a very large file is never wrongly deleted.
 */
@Component
class AttachmentCleanupJob(
    private val attachmentRepo: AttachmentRepository,
    private val minioClient: MinioClient,
    private val minioProps: MinioProperties,
) {
    private val log = LoggerFactory.getLogger(AttachmentCleanupJob::class.java)

    @Scheduled(fixedDelayString = "PT6H", initialDelayString = "PT10M")
    @Transactional
    fun cleanStalePending() {
        val cutoff = Instant.now().minus(2, ChronoUnit.HOURS)
        val stale = attachmentRepo.findByScanStatusAndCreatedAtBefore("PENDING", cutoff)
        if (stale.isEmpty()) return

        log.info("Cleaning {} stale PENDING attachment(s)", stale.size)
        stale.forEach { attachment ->
            runCatching {
                minioClient.removeObject(
                    RemoveObjectArgs.builder()
                        .bucket(minioProps.bucketAttachments)
                        .`object`(attachment.objectKey)
                        .build(),
                )
            }.onFailure { ex ->
                // Object may not exist if the PUT never completed — that's expected
                log.debug("MinIO removeObject skipped for {}: {}", attachment.id, ex.message)
            }
            attachmentRepo.delete(attachment)
            log.info("Deleted stale PENDING attachment id={}", attachment.id)
        }
    }
}
