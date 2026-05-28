package `in`.gov.ir.pia.dashboard

import `in`.gov.ir.pia.security.PiaPrincipal
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import java.util.UUID

// ── DTOs ─────────────────────────────────────────────────────────────────────

/**
 * Summary row for a single project, as shown in the zone-dashboard projects table.
 *
 * [daysSinceRbRecommendation] is null when no RB recommendation date is recorded.
 * [slaBreachCount] and [drawingsInApproval] default to 0 when no [project_summary]
 * row exists yet (the row is created lazily on the first workflow transition).
 */
data class ZoneProjectDto(
    val projectId: UUID,
    val projectCode: String?,
    val name: String,
    val lifecycleState: String,
    val daysSinceRbRecommendation: Long?,
    val slaBreachCount: Int,
    val drawingsInApproval: Int,
    /** Division name (null when the project has no division assigned yet). */
    val divisionName: String?,
)

/**
 * Zone-level KPI strip + sorted project list.
 *
 * KPI columns ([projectsActive], [projectsWithSlaBreaches], [totalDrawingsInApproval])
 * are read from [zone_summary] and default to 0 until the first workflow event in the
 * zone triggers a cascade update.  The [projects] list is always current because it is
 * read live from the [projects] table.
 */
data class ZoneSummaryDto(
    val zoneId: UUID,
    val zoneCode: String,
    val zoneName: String,
    val projectsActive: Int,
    val projectsWithSlaBreaches: Int,
    val totalDrawingsInApproval: Int,
    val projects: List<ZoneProjectDto>,
)

/** Top-level response for GET /api/v1/dashboard/zone. */
data class ZoneDashboardResponse(
    val zones: List<ZoneSummaryDto>,
)

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * Reads zone-scope KPI data from [zone_summary] and live project rows.
 *
 * Access is filtered to the calling principal's [accessibleZoneIds] (primary zone +
 * any cross-zone grants from [user_zone_assignments]).  Super-admin sees all zones.
 *
 * This service never touches raw [activity_records] for counts — KPIs come from
 * summary tables (architecture rule #3).  Only the projects list is a live query.
 */
@Service
@Transactional(readOnly = true)
class ZoneDashboardService(
    private val jdbc: JdbcTemplate,
) {
    fun getZoneDashboard(principal: PiaPrincipal): ZoneDashboardResponse {
        val accessibleZoneIds: List<UUID> =
            if (principal.isSuperAdmin) {
                allActiveZoneIds()
            } else {
                principal.accessibleZoneIds.toList()
            }

        if (accessibleZoneIds.isEmpty()) return ZoneDashboardResponse(zones = emptyList())
        return ZoneDashboardResponse(zones = loadZones(accessibleZoneIds))
    }

    /**
     * Returns zone KPI strips and project lists for ALL active zones.
     * Used by [PanIndiaDashboardService] which is not principal-scoped.
     */
    fun loadAllZones(): List<ZoneSummaryDto> = loadZones(allActiveZoneIds())

    private fun allActiveZoneIds(): List<UUID> =
        jdbc.queryForList(
            "SELECT id FROM zones WHERE is_active ORDER BY display_order",
            UUID::class.java,
        )

    /**
     * Core zone-loading logic: fetches zone metadata + KPIs from [zone_summary]
     * and a live project list for each of the given [zoneIds].
     */
    fun loadZones(zoneIds: List<UUID>): List<ZoneSummaryDto> {
        if (zoneIds.isEmpty()) return emptyList()

        // Load zone metadata + pre-computed KPIs for all requested zones in one query.
        val placeholders = zoneIds.joinToString(",") { "?" }
        data class ZoneRow(
            val zoneId: UUID,
            val zoneCode: String,
            val zoneName: String,
            val projectsActive: Int,
            val projectsWithSlaBreaches: Int,
            val totalDrawingsInApproval: Int,
        )

        val zoneRows: List<ZoneRow> = jdbc.query(
            """
            SELECT z.id                                               AS zone_id,
                   z.code                                            AS zone_code,
                   z.name                                            AS zone_name,
                   COALESCE(zs.projects_active, 0)                  AS projects_active,
                   COALESCE(zs.projects_with_sla_breaches, 0)       AS projects_with_sla_breaches,
                   COALESCE(zs.total_drawings_in_approval, 0)       AS total_drawings_in_approval
            FROM zones z
            LEFT JOIN zone_summary zs ON zs.zone_id = z.id
            WHERE z.id IN ($placeholders)
            ORDER BY z.display_order, z.code
            """.trimIndent(),
            { rs, _ ->
                ZoneRow(
                    zoneId = rs.getObject("zone_id", UUID::class.java),
                    zoneCode = rs.getString("zone_code"),
                    zoneName = rs.getString("zone_name"),
                    projectsActive = rs.getInt("projects_active"),
                    projectsWithSlaBreaches = rs.getInt("projects_with_sla_breaches"),
                    totalDrawingsInApproval = rs.getInt("total_drawings_in_approval"),
                )
            },
            *zoneIds.toTypedArray(),
        )

        val today = LocalDate.now()

        return zoneRows.map { zone ->
            // Live project list — always current, not from the summary table.
            val projects: List<ZoneProjectDto> = jdbc.query(
                """
                SELECT p.id,
                       p.project_code,
                       p.name,
                       p.lifecycle_state,
                       p.recommended_by_board_on,
                       COALESCE(ps.sla_breach_count, 0)     AS sla_breach_count,
                       COALESCE(ps.drawings_in_approval, 0) AS drawings_in_approval,
                       d.name                               AS division_name
                FROM projects p
                LEFT JOIN project_summary ps ON ps.project_id = p.id
                LEFT JOIN divisions d         ON d.id = p.division_id
                WHERE p.zone_id = ?
                  AND NOT p.is_deleted
                ORDER BY p.name
                """.trimIndent(),
                { rs, _ ->
                    val rbDate = rs.getDate("recommended_by_board_on")
                    val daysSinceRb = rbDate?.let {
                        ChronoUnit.DAYS.between(it.toLocalDate(), today)
                    }
                    ZoneProjectDto(
                        projectId = rs.getObject("id", UUID::class.java),
                        projectCode = rs.getString("project_code"),
                        name = rs.getString("name"),
                        lifecycleState = rs.getString("lifecycle_state"),
                        daysSinceRbRecommendation = daysSinceRb,
                        slaBreachCount = rs.getInt("sla_breach_count"),
                        drawingsInApproval = rs.getInt("drawings_in_approval"),
                        divisionName = rs.getString("division_name"),
                    )
                },
                zone.zoneId,
            )

            ZoneSummaryDto(
                zoneId = zone.zoneId,
                zoneCode = zone.zoneCode,
                zoneName = zone.zoneName,
                projectsActive = zone.projectsActive,
                projectsWithSlaBreaches = zone.projectsWithSlaBreaches,
                totalDrawingsInApproval = zone.totalDrawingsInApproval,
                projects = projects,
            )
        }
    }
}
