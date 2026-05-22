package `in`.gov.ir.pia.export

import org.springframework.context.ApplicationEventPublisher
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

// ── DTOs ─────────────────────────────────────────────────────────────────────

data class ExportJobSubmitResponse(
    val jobId: UUID,
    val status: String,
)

data class ExportJobStatusResponse(
    val jobId: UUID,
    val status: String,
    val fileName: String?,
    val errorMessage: String?,
)

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * Orchestrates both synchronous and asynchronous Excel export paths.
 *
 * Project scope (synchronous):
 *   Generate the workbook immediately, return bytes.  No job row is written to
 *   the DB — the bytes are streamed directly in the HTTP response.
 *
 * Zone scope (asynchronous):
 *   1. Insert a QUEUED job row.
 *   2. Publish [ExportJobCreatedEvent] inside the transaction.
 *   3. Return the job ID to the caller.
 *   [ExportJobProcessor] picks it up after commit via @TransactionalEventListener.
 *
 * Download (one-time):
 *   Checks that the job is COMPLETED, not expired, and has download_count == 0.
 *   Increments download_count atomically and returns the bytes.
 */
@Service
@Transactional
class ExportService(
    private val jdbc: JdbcTemplate,
    private val projectExcelGenerator: ProjectExcelGenerator,
    private val zoneExcelGenerator: ZoneExcelGenerator,
    private val eventPublisher: ApplicationEventPublisher,
) {
    /**
     * Synchronous project export.
     * Returns the generated workbook bytes directly — no job row, no async step.
     */
    @Transactional(readOnly = true)
    fun exportProject(projectId: UUID): Pair<ByteArray, String> {
        val bytes = projectExcelGenerator.generate(projectId)
        val fileName = "project-export-$projectId.xlsx"
        return bytes to fileName
    }

    /**
     * Asynchronous zone export.
     * Creates a QUEUED job row, publishes the creation event, and returns immediately.
     */
    fun submitZoneExport(zoneId: UUID, createdByUserId: UUID): ExportJobSubmitResponse {
        val jobId = UUID.randomUUID()
        jdbc.update(
            """
            INSERT INTO export_jobs (id, export_scope, scope_id, status, created_by_user_id)
            VALUES (?, 'ZONE', ?, 'QUEUED', ?)
            """.trimIndent(),
            jobId, zoneId, createdByUserId,
        )
        // Published inside the transaction — listener fires AFTER_COMMIT
        eventPublisher.publishEvent(ExportJobCreatedEvent(jobId))
        return ExportJobSubmitResponse(jobId = jobId, status = "QUEUED")
    }

    /**
     * Returns status and metadata for a job without downloading the file.
     */
    @Transactional(readOnly = true)
    fun getJobStatus(jobId: UUID): ExportJobStatusResponse {
        val row = jdbc.queryForMap(
            "SELECT status, file_name, error_message FROM export_jobs WHERE id = ?",
            jobId,
        )
        return ExportJobStatusResponse(
            jobId = jobId,
            status = row["status"] as String,
            fileName = row["file_name"] as? String,
            errorMessage = row["error_message"] as? String,
        )
    }

    /**
     * One-time download: returns bytes and file name, then increments download_count.
     * Returns null when the job is not ready (QUEUED / PROCESSING / FAILED),
     * has already been downloaded, or has expired.
     *
     * Callers must check the [DownloadResult] type to decide the response status.
     */
    fun download(jobId: UUID): DownloadResult {
        // Optimistic fetch — check preconditions before touching download_count
        val row = jdbc.queryForMap(
            """
            SELECT status, file_data, file_name, download_count, expires_at
            FROM export_jobs WHERE id = ?
            """.trimIndent(),
            jobId,
        ) ?: return DownloadResult.NotFound

        val status = row["status"] as String
        if (status != "COMPLETED") return DownloadResult.NotReady(status)

        val downloadCount = (row["download_count"] as Number).toInt()
        if (downloadCount >= 1) return DownloadResult.AlreadyDownloaded

        val expiresAt = (row["expires_at"] as? java.sql.Timestamp)?.toInstant()
        if (expiresAt != null && java.time.Instant.now().isAfter(expiresAt)) {
            return DownloadResult.Expired
        }

        val bytes = row["file_data"] as? ByteArray ?: return DownloadResult.NotReady("COMPLETED_NO_DATA")
        val fileName = (row["file_name"] as? String) ?: "export-$jobId.xlsx"

        // Increment download_count — subsequent requests return 410
        jdbc.update(
            "UPDATE export_jobs SET download_count = download_count + 1 WHERE id = ?",
            jobId,
        )

        return DownloadResult.Ready(bytes, fileName)
    }
}

// ── Download result sealed hierarchy ─────────────────────────────────────────

sealed interface DownloadResult {
    data class Ready(val bytes: ByteArray, val fileName: String) : DownloadResult
    data class NotReady(val status: String) : DownloadResult
    object NotFound : DownloadResult
    object AlreadyDownloaded : DownloadResult
    object Expired : DownloadResult
}
