package `in`.gov.ir.pia.dashboard

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

// ── DTOs ─────────────────────────────────────────────────────────────────────

/**
 * Top-level response for GET /api/v1/dashboard/pan-india.
 *
 * KPI fields ([totalProjectsActive], [totalProjectsWithSlaBreaches],
 * [totalDrawingsInApproval]) are read from the singleton [pan_india_summary]
 * row and are guaranteed to be the sum of all zone_summary values — the cascade
 * in [SummaryUpdater] recomputes them from zone_summary on every zone change.
 *
 * [zones] is the full zone-level breakdown (same data as the zone dashboard but
 * scoped to all zones rather than the caller's accessible subset).
 * The projects list within each zone is always current (live query).
 *
 * "Numbers reconcile (sum of zones = PAN India)" holds by construction because
 * both the top-level KPIs and the zone KPI rows are derived from [zone_summary].
 */
data class PanIndiaDashboardResponse(
    val totalProjectsActive: Int,
    val totalProjectsWithSlaBreaches: Int,
    val totalDrawingsInApproval: Int,
    val zones: List<ZoneSummaryDto>,
)

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * Reads the [pan_india_summary] singleton for system-wide KPIs and delegates to
 * [ZoneDashboardService.loadAllZones] for the per-zone breakdown.
 *
 * Requires [DASHBOARD.VIEW.PAN_INDIA] — enforced by [DashboardController].
 * This service is not principal-scoped; all zones are always returned.
 */
@Service
@Transactional(readOnly = true)
class PanIndiaDashboardService(
    private val jdbc: JdbcTemplate,
    private val zoneDashboardService: ZoneDashboardService,
) {
    fun getPanIndiaDashboard(): PanIndiaDashboardResponse {
        // Read system-wide KPIs from the singleton row (default 0 if not yet populated).
        val kpis = jdbc.query(
            """
            SELECT total_projects_active,
                   total_projects_with_sla_breaches,
                   total_drawings_in_approval
            FROM pan_india_summary
            LIMIT 1
            """.trimIndent(),
            { rs, _ ->
                Triple(
                    rs.getInt("total_projects_active"),
                    rs.getInt("total_projects_with_sla_breaches"),
                    rs.getInt("total_drawings_in_approval"),
                )
            },
        ).firstOrNull() ?: Triple(0, 0, 0)

        val zones = zoneDashboardService.loadAllZones()

        return PanIndiaDashboardResponse(
            totalProjectsActive = kpis.first,
            totalProjectsWithSlaBreaches = kpis.second,
            totalDrawingsInApproval = kpis.third,
            zones = zones,
        )
    }
}
