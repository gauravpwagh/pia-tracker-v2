package `in`.gov.ir.pia.dashboard

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.util.UUID

// ── DTOs ─────────────────────────────────────────────────────────────────────

data class ActivitySummaryDto(
    val activityTypeCode: String,
    val totalRecords: Int,
    val draftCount: Int,
    val submittedCount: Int,
    val verifiedCount: Int,
    val authenticatedCount: Int,
    val sentBackCount: Int,
    val updatedAt: Instant,
)

data class ProjectDashboardDto(
    val projectId: UUID,
    val summaries: List<ActivitySummaryDto>,
)

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * Reads aggregated KPI data from [project_activity_summary].
 *
 * This service never touches raw [activity_records] for counts — only the
 * summary table (docs/dashboards.md, architecture rule #3).
 */
@Service
@Transactional(readOnly = true)
class DashboardService(
    private val jdbc: JdbcTemplate,
) {
    fun getProjectDashboard(projectId: UUID): ProjectDashboardDto {
        val summaries = jdbc.query(
            """
            SELECT activity_type_code, total_records, draft_count, submitted_count,
                   verified_count, authenticated_count, sent_back_count, updated_at
            FROM project_activity_summary
            WHERE project_id = ?
            ORDER BY activity_type_code
            """.trimIndent(),
            { rs, _ ->
                ActivitySummaryDto(
                    activityTypeCode = rs.getString("activity_type_code"),
                    totalRecords = rs.getInt("total_records"),
                    draftCount = rs.getInt("draft_count"),
                    submittedCount = rs.getInt("submitted_count"),
                    verifiedCount = rs.getInt("verified_count"),
                    authenticatedCount = rs.getInt("authenticated_count"),
                    sentBackCount = rs.getInt("sent_back_count"),
                    updatedAt = rs.getTimestamp("updated_at").toInstant(),
                )
            },
            projectId,
        )
        return ProjectDashboardDto(projectId = projectId, summaries = summaries)
    }
}
