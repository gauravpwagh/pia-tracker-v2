package `in`.gov.ir.pia.dashboard

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.util.UUID

// ── DTOs ─────────────────────────────────────────────────────────────────────

data class ForestStageSummaryDto(
    val stageCode: String,
    val totalRecords: Int,
    val draftCount: Int,
    val submittedCount: Int,
    val verifiedCount: Int,
    val authenticatedCount: Int,
    val sentBackCount: Int,
    val updatedAt: Instant,
)

data class ForestStageBreakdownDto(
    val projectId: UUID,
    val stages: List<ForestStageSummaryDto>,
)

data class UtilitySubtypeSummaryDto(
    val recordSubtype: String,
    val totalRecords: Int,
    val draftCount: Int,
    val submittedCount: Int,
    val verifiedCount: Int,
    val authenticatedCount: Int,
    val sentBackCount: Int,
    val updatedAt: Instant,
)

data class UtilitySubtypeBreakdownDto(
    val projectId: UUID,
    val subtypes: List<UtilitySubtypeSummaryDto>,
)

data class ActivitySummaryDto(
    val activityTypeCode: String,
    val totalRecords: Int,
    val draftCount: Int,
    val submittedCount: Int,
    val verifiedCount: Int,
    val authenticatedCount: Int,
    val sentBackCount: Int,
    val slaBreachCount: Int,
    val updatedAt: Instant,
)

data class ProjectDashboardDto(
    val projectId: UUID,
    val summaries: List<ActivitySummaryDto>,
)

// ── Project overview (cross-activity) DTOs ────────────────────────────────────

/**
 * Per-activity card for the cross-activity project overview.
 * RAG status is derived server-side:
 *   GREEN  — slaBreachCount == 0 and no pending items
 *   AMBER  — pendingCount > 0 but no SLA breaches
 *   RED    — slaBreachCount > 0
 */
data class ActivityCardDto(
    val activityTypeCode: String,
    val totalRecords: Int,
    val authenticatedCount: Int,
    /** Records not yet authenticated (draft + submitted + verified + sent_back). */
    val pendingCount: Int,
    val slaBreachCount: Int,
    /** Derived RAG: "GREEN", "AMBER", or "RED". */
    val ragStatus: String,
)

/**
 * Cross-activity project overview.  Shown in the tree-view detail pane when the
 * project node is selected (dashboards.md § 9).
 */
data class ProjectOverviewDto(
    val projectId: UUID,
    val projectCode: String?,
    val name: String,
    val zoneCode: String?,
    val lifecycleState: String,
    val daysSinceRbRecommendation: Long?,
    /** Sum of sla_breach_count across all activity_type summaries. */
    val totalSlaBreaches: Int,
    val totalDrawingsInApproval: Int,
    val activityCards: List<ActivityCardDto>,
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
        val summaries =
            jdbc.query(
                """
                SELECT activity_type_code, total_records, draft_count, submitted_count,
                       verified_count, authenticated_count, sent_back_count,
                       sla_breach_count, updated_at
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
                        slaBreachCount = rs.getInt("sla_breach_count"),
                        updatedAt = rs.getTimestamp("updated_at").toInstant(),
                    )
                },
                projectId,
            )
        return ProjectDashboardDto(projectId = projectId, summaries = summaries)
    }

    /**
     * Cross-activity project overview (dashboards.md § 9).
     *
     * Composes project metadata, per-activity KPI cards (from
     * project_activity_summary), and project-level totals (from project_summary).
     * Every count comes from a summary table — no raw record scans.
     */
    fun getProjectOverview(projectId: UUID): ProjectOverviewDto {
        // Project metadata
        val project = jdbc.queryForMap(
            """
            SELECT p.project_code, p.name, p.lifecycle_state, p.recommended_by_board_on,
                   z.code AS zone_code
            FROM projects p
            LEFT JOIN zones z ON z.id = p.zone_id
            WHERE p.id = ?
            """.trimIndent(),
            projectId,
        )

        val rbDate = (project["recommended_by_board_on"] as? java.sql.Date)?.toLocalDate()
        val daysSinceRb = rbDate?.let {
            java.time.temporal.ChronoUnit.DAYS.between(it, java.time.LocalDate.now())
        }

        // Project-level totals from project_summary
        val projectSummary = jdbc.queryForList(
            "SELECT sla_breach_count, drawings_in_approval FROM project_summary WHERE project_id = ?",
            projectId,
        ).firstOrNull()

        val totalSlaBreaches = (projectSummary?.get("sla_breach_count") as? Number)?.toInt() ?: 0
        val totalDrawingsInApproval = (projectSummary?.get("drawings_in_approval") as? Number)?.toInt() ?: 0

        // Per-activity cards from project_activity_summary
        val activityCards = jdbc.query(
            """
            SELECT activity_type_code, total_records, authenticated_count,
                   draft_count + submitted_count + verified_count + sent_back_count AS pending_count,
                   sla_breach_count
            FROM project_activity_summary
            WHERE project_id = ?
            ORDER BY activity_type_code
            """.trimIndent(),
            { rs, _ ->
                val slaBreachCount = rs.getInt("sla_breach_count")
                val pendingCount = rs.getInt("pending_count")
                val ragStatus = when {
                    slaBreachCount > 0 -> "RED"
                    pendingCount > 0 -> "AMBER"
                    else -> "GREEN"
                }
                ActivityCardDto(
                    activityTypeCode = rs.getString("activity_type_code"),
                    totalRecords = rs.getInt("total_records"),
                    authenticatedCount = rs.getInt("authenticated_count"),
                    pendingCount = pendingCount,
                    slaBreachCount = slaBreachCount,
                    ragStatus = ragStatus,
                )
            },
            projectId,
        )

        return ProjectOverviewDto(
            projectId = projectId,
            projectCode = project["project_code"] as? String,
            name = project["name"] as String,
            zoneCode = project["zone_code"] as? String,
            lifecycleState = project["lifecycle_state"] as String,
            daysSinceRbRecommendation = daysSinceRb,
            totalSlaBreaches = totalSlaBreaches,
            totalDrawingsInApproval = totalDrawingsInApproval,
            activityCards = activityCards,
        )
    }

    /**
     * Returns per-utility-subtype counts for [projectId] from
     * [project_utility_subtype_summary]. Used for the Utility Shifting
     * activity-level dashboard (Phase 2.3).
     */
    fun getUtilitySubtypeBreakdown(projectId: UUID): UtilitySubtypeBreakdownDto {
        val subtypes =
            jdbc.query(
                """
                SELECT record_subtype, total_records, draft_count, submitted_count,
                       verified_count, authenticated_count, sent_back_count, updated_at
                FROM project_utility_subtype_summary
                WHERE project_id = ?
                ORDER BY record_subtype
                """.trimIndent(),
                { rs, _ ->
                    UtilitySubtypeSummaryDto(
                        recordSubtype = rs.getString("record_subtype"),
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
        return UtilitySubtypeBreakdownDto(projectId = projectId, subtypes = subtypes)
    }

    /**
     * Returns per-stage workflow counts for Forest Clearance records in [projectId]
     * from [project_forest_stage_summary].  Used for the Forest Clearance
     * stage-progression dashboard widget (Phase 2.4).
     *
     * Only stages that have had at least one workflow transition appear in the
     * result (rows are created lazily on first transition, not at record creation).
     */
    fun getForestStageBreakdown(projectId: UUID): ForestStageBreakdownDto {
        val stages =
            jdbc.query(
                """
                SELECT stage_code, total_records, draft_count, submitted_count,
                       verified_count, authenticated_count, sent_back_count, updated_at
                FROM project_forest_stage_summary
                WHERE project_id = ?
                ORDER BY stage_code
                """.trimIndent(),
                { rs, _ ->
                    ForestStageSummaryDto(
                        stageCode = rs.getString("stage_code"),
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
        return ForestStageBreakdownDto(projectId = projectId, stages = stages)
    }
}
