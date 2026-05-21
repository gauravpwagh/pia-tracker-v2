package `in`.gov.ir.pia.api

import `in`.gov.ir.pia.dashboard.DashboardService
import `in`.gov.ir.pia.dashboard.ForestStageBreakdownDto
import `in`.gov.ir.pia.dashboard.ProjectDashboardDto
import `in`.gov.ir.pia.dashboard.UtilitySubtypeBreakdownDto
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

/**
 * KPI dashboard endpoints.
 *
 *   GET /api/v1/dashboard/projects/{projectId} — aggregated activity summary
 *
 * Reads from [project_activity_summary] only — never from raw records.
 * Requires DASHBOARD.VIEW.PROJECT (assigned users) or DASHBOARD.VIEW.ZONE / .PAN_INDIA.
 */
@RestController
class DashboardController(
    private val dashboardService: DashboardService,
) {
    @GetMapping("/api/v1/dashboard/projects/{projectId}")
    @PreAuthorize(
        "@pe.hasPermission(authentication, null, 'DASHBOARD.VIEW.PROJECT') or " +
            "@pe.hasPermission(authentication, null, 'DASHBOARD.VIEW.ZONE') or " +
            "@pe.hasPermission(authentication, null, 'DASHBOARD.VIEW.PAN_INDIA')",
    )
    fun getProjectDashboard(
        @PathVariable projectId: UUID,
    ): ProjectDashboardDto = dashboardService.getProjectDashboard(projectId)

    /**
     * Returns per-utility-subtype record counts for a project.
     *
     * Reads from [project_utility_subtype_summary] — maintained by SummaryUpdater
     * alongside the main activity summary on every workflow transition.
     *
     * Used by the Utility Shifting activity-level dashboard widget (Phase 2.3).
     */
    @GetMapping("/api/v1/dashboard/projects/{projectId}/utility-breakdown")
    @PreAuthorize(
        "@pe.hasPermission(authentication, null, 'DASHBOARD.VIEW.PROJECT') or " +
            "@pe.hasPermission(authentication, null, 'DASHBOARD.VIEW.ZONE') or " +
            "@pe.hasPermission(authentication, null, 'DASHBOARD.VIEW.PAN_INDIA')",
    )
    fun getUtilityBreakdown(
        @PathVariable projectId: UUID,
    ): UtilitySubtypeBreakdownDto = dashboardService.getUtilitySubtypeBreakdown(projectId)

    /**
     * Returns per-stage workflow counts for Forest Clearance records in a project.
     *
     * Reads from [project_forest_stage_summary] — maintained by SummaryUpdater
     * alongside the main activity summary on every stage-level workflow transition.
     *
     * Stages appear in the result only after their first workflow transition;
     * stages still in the initial DRAFT (never submitted) are absent.
     *
     * Used by the Forest Clearance stage-progression dashboard widget (Phase 2.4).
     */
    @GetMapping("/api/v1/dashboard/projects/{projectId}/forest-stage-breakdown")
    @PreAuthorize(
        "@pe.hasPermission(authentication, null, 'DASHBOARD.VIEW.PROJECT') or " +
            "@pe.hasPermission(authentication, null, 'DASHBOARD.VIEW.ZONE') or " +
            "@pe.hasPermission(authentication, null, 'DASHBOARD.VIEW.PAN_INDIA')",
    )
    fun getForestStageBreakdown(
        @PathVariable projectId: UUID,
    ): ForestStageBreakdownDto = dashboardService.getForestStageBreakdown(projectId)
}
