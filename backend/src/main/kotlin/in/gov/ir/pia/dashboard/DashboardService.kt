package `in`.gov.ir.pia.dashboard

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
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

// ── Dashboard records DTOs ────────────────────────────────────────────────────

/**
 * Lightweight record row for the dashboard records tables (§4-8).
 * Returns data_json as a parsed [JsonNode] so the frontend can extract
 * activity-specific fields (village_name, forest_area_hectares, etc.).
 * Gated by DASHBOARD.VIEW.PROJECT — a superset of the full record endpoint
 * which requires ACTIVITY_RECORD.READ.OWN.
 */
data class DashboardRecordDto(
    val id: UUID,
    val recordState: String,
    val recordSubtype: String?,
    val dataJson: JsonNode,
    val createdAt: Instant,
    val updatedAt: Instant,
)

// ── Drawing approver matrix DTOs ──────────────────────────────────────────────

data class DrawingApproverCellDto(
    val designationCode: String,
    val drawingType: String,
    val pendingCount: Int,
    val approvedCount: Int,
    val sentBackCount: Int,
)

data class DrawingApproverMatrixDto(
    val cells: List<DrawingApproverCellDto>,
    /** Unique designation codes, sorted alphabetically. */
    val designations: List<String>,
    /** Unique drawing types, sorted alphabetically. */
    val drawingTypes: List<String>,
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
    private val objectMapper: ObjectMapper,
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

    // ── Dashboard records (§4-8) ──────────────────────────────────────────────

    /**
     * Returns all non-deleted records of [activityTypeCode] for [projectId],
     * with their full [data_json] parsed.
     *
     * Used by the per-activity dashboard sections (§4 Land Acquisition,
     * §5 Utility Shifting, §6 Forest Clearance, §7 Drawing Approval,
     * §8 Tender / Office).  Reads raw [activity_records] — justified because
     * this endpoint serves tabular record views, not KPI aggregations.
     * KPI counters still come from summary tables via [getProjectDashboard].
     */
    fun getActivityRecordsForDashboard(projectId: UUID, activityTypeCode: String): List<DashboardRecordDto> =
        jdbc.query(
            """
            SELECT ar.id, ar.record_state, ar.record_subtype,
                   ar.data_json::text AS data_json, ar.created_at, ar.updated_at
            FROM activity_records ar
            JOIN project_activities pa ON pa.id = ar.project_activity_id
            WHERE pa.project_id    = ?
              AND pa.activity_type_code = ?
              AND NOT ar.is_deleted
              AND NOT pa.is_deleted
            ORDER BY ar.created_at
            """.trimIndent(),
            { rs, _ ->
                DashboardRecordDto(
                    id            = rs.getObject("id", UUID::class.java),
                    recordState   = rs.getString("record_state"),
                    recordSubtype = rs.getString("record_subtype"),
                    dataJson      = objectMapper.readTree(rs.getString("data_json") ?: "{}"),
                    createdAt     = rs.getTimestamp("created_at").toInstant(),
                    updatedAt     = rs.getTimestamp("updated_at").toInstant(),
                )
            },
            projectId,
            activityTypeCode,
        )

    // ── Drawing approver matrix (§7) ──────────────────────────────────────────

    /**
     * Returns a heatmap of pending/approved/sent-back counts per
     * designation × drawing_type combination for the given project.
     *
     * Used by the Drawing Approval approver heatmap widget.
     * Reads from [drawing_approvers] joined to [activity_records].
     */
    fun getDrawingApproverMatrix(projectId: UUID): DrawingApproverMatrixDto {
        val cells = jdbc.query(
            """
            SELECT da.approval_designation_code                                        AS desig,
                   COALESCE(ar.data_json->>'drawing_type', 'UNKNOWN')                 AS dtype,
                   COUNT(*) FILTER (WHERE da.status = 'PENDING')                      AS pending,
                   COUNT(*) FILTER (WHERE da.status = 'APPROVED')                     AS approved,
                   COUNT(*) FILTER (WHERE da.status = 'SENT_BACK')                    AS sent_back
            FROM drawing_approvers da
            JOIN activity_records   ar ON ar.id = da.activity_record_id
            JOIN project_activities pa ON pa.id = ar.project_activity_id
            WHERE pa.project_id = ?
              AND NOT da.is_deleted
              AND NOT ar.is_deleted
              AND NOT pa.is_deleted
            GROUP BY da.approval_designation_code, ar.data_json->>'drawing_type'
            ORDER BY da.approval_designation_code, ar.data_json->>'drawing_type'
            """.trimIndent(),
            { rs, _ ->
                DrawingApproverCellDto(
                    designationCode = rs.getString("desig"),
                    drawingType     = rs.getString("dtype"),
                    pendingCount    = rs.getInt("pending"),
                    approvedCount   = rs.getInt("approved"),
                    sentBackCount   = rs.getInt("sent_back"),
                )
            },
            projectId,
        )
        return DrawingApproverMatrixDto(
            cells        = cells,
            designations = cells.map { it.designationCode }.distinct().sorted(),
            drawingTypes = cells.map { it.drawingType }.distinct().sorted(),
        )
    }
}
