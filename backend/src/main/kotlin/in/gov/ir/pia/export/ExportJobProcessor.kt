package `in`.gov.ir.pia.export

import `in`.gov.ir.pia.notification.NotificationService
import org.slf4j.LoggerFactory
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.scheduling.annotation.Async
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.event.TransactionPhase
import org.springframework.transaction.event.TransactionalEventListener
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

/**
 * Processes async export jobs.
 *
 * Two-bean pattern required by Spring 6.1+:
 *
 *   [ExportJobTrigger] — listens for [ExportJobCreatedEvent] with
 *   @TransactionalEventListener(phase = AFTER_COMMIT) and immediately delegates
 *   to [ExportJobProcessor.processJob] on this bean.
 *
 *   [ExportJobProcessor] — the `processJob` method is annotated @Async so Spring
 *   dispatches it to the "piaAsync" thread pool.  Because @Async and
 *   @TransactionalEventListener cannot be combined on the same method in Spring 6.1+,
 *   the two annotations are split across two beans.
 *
 * Processing steps:
 *   1. Mark job PROCESSING.
 *   2. Resolve scope and generate Excel bytes.
 *   3. Store bytes, set status COMPLETED, set file_name and expires_at.
 *   4. Fire an in-app notification to the requesting user.
 *
 * On any exception the job is marked FAILED and the message stored in error_message.
 */
@Component
class ExportJobProcessor(
    private val jdbc: JdbcTemplate,
    private val projectExcelGenerator: ProjectExcelGenerator,
    private val zoneExcelGenerator: ZoneExcelGenerator,
    private val notificationService: NotificationService,
) {
    private val log = LoggerFactory.getLogger(ExportJobProcessor::class.java)

    @Async("piaAsync")
    @Transactional
    fun processJob(jobId: UUID) {
        log.info("Processing export job {}", jobId)

        val row = jdbc.queryForMap(
            "SELECT export_scope, scope_id, created_by_user_id FROM export_jobs WHERE id = ?",
            jobId,
        )
        val scope = row["export_scope"] as String
        val scopeId = row["scope_id"] as UUID?
        val createdByUserId = row["created_by_user_id"] as UUID

        // Mark PROCESSING so the status endpoint reflects progress
        jdbc.update("UPDATE export_jobs SET status = 'PROCESSING' WHERE id = ?", jobId)

        try {
            val (bytes, fileName) = generateExcel(scope, scopeId)
            val expiresAt = Instant.now().plus(24, ChronoUnit.HOURS)

            jdbc.update(
                """
                UPDATE export_jobs
                SET status = 'COMPLETED',
                    file_name = ?,
                    file_data = ?,
                    expires_at = ?
                WHERE id = ?
                """.trimIndent(),
                fileName,
                bytes,
                java.sql.Timestamp.from(expiresAt),
                jobId,
            )

            notificationService.create(
                recipientUserId = createdByUserId,
                notificationType = "EXPORT_READY",
                title = "Export ready",
                body = "Your $scope export '$fileName' is ready to download.",
                entityType = "EXPORT_JOB",
                entityId = jobId,
                linkUrl = "/api/v1/export/jobs/$jobId/download",
            )

            log.info("Export job {} completed — file '{}'", jobId, fileName)
        } catch (ex: Exception) {
            log.error("Export job {} failed", jobId, ex)
            jdbc.update(
                "UPDATE export_jobs SET status = 'FAILED', error_message = ? WHERE id = ?",
                ex.message?.take(2048) ?: "Unknown error",
                jobId,
            )
        }
    }

    private fun generateExcel(scope: String, scopeId: UUID?): Pair<ByteArray, String> =
        when (scope) {
            "PROJECT" -> {
                requireNotNull(scopeId) { "scope_id must not be null for PROJECT exports" }
                projectExcelGenerator.generate(scopeId) to "project-export-$scopeId.xlsx"
            }
            "ZONE" -> {
                requireNotNull(scopeId) { "scope_id must not be null for ZONE exports" }
                zoneExcelGenerator.generate(scopeId) to
                    "zone-export-${scopeId}-${System.currentTimeMillis()}.xlsx"
            }
            else -> error("Unsupported async export scope: $scope")
        }
}

// ── Trigger — separate bean required by Spring 6.1+ ──────────────────────────

/**
 * Bridges the AFTER_COMMIT transactional event to the async processor.
 *
 * Must be a separate Spring bean so that the @Async proxy on [ExportJobProcessor]
 * is used correctly.  Self-invocation would bypass the proxy.
 */
@Component
class ExportJobTrigger(
    private val processor: ExportJobProcessor,
) {
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    fun onExportJobCreated(event: ExportJobCreatedEvent) {
        processor.processJob(event.jobId)
    }
}
