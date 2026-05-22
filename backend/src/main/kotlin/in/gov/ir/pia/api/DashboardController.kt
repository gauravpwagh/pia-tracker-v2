package `in`.gov.ir.pia.api

import `in`.gov.ir.pia.dashboard.DashboardService
import `in`.gov.ir.pia.dashboard.ForestStageBreakdownDto
import `in`.gov.ir.pia.dashboard.ProjectDashboardDto
import `in`.gov.ir.pia.dashboard.UtilitySubtypeBreakdownDto
import `in`.gov.ir.pia.dashboard.PanIndiaDashboardResponse
import `in`.gov.ir.pia.dashboard.PanIndiaDashboardService
import `in`.gov.ir.pia.dashboard.ZoneDashboardResponse
import `in`.gov.ir.pia.dashboard.ZoneDashboardService
import `in`.gov.ir.pia.security.PiaPrincipal
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.responses.ApiResponses
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

/**
 * KPI dashboard endpoints.
 *
 * Endpoint catalogue:
 *   GET /api/v1/dashboard/projects/{projectId}                     — aggregated activity summary
 *   GET /api/v1/dashboard/projects/{projectId}/utility-breakdown   — utility-type breakdown
 *   GET /api/v1/dashboard/projects/{projectId}/forest-stage-breakdown — Forest Clearance stages
 *   GET /api/v1/dashboard/zone                                     — zone-scope KPI strip + projects (Phase 2.8)
 *
 * Reads from summary tables only — never from raw records.
 */
@RestController
@Tag(name = "Dashboard", description = "KPI dashboard endpoints")
class DashboardController(
    private val dashboardService: DashboardService,
    private val zoneDashboardService: ZoneDashboardService,
    private val panIndiaDashboardService: PanIndiaDashboardService,
) {
    @GetMapping("/api/v1/dashboard/projects/{projectId}")
    @PreAuthorize(
        "@pe.hasPermission(authentication, null, 'DASHBOARD.VIEW.PROJECT') or " +
            "@pe.hasPermission(authentication, null, 'DASHBOARD.VIEW.ZONE') or " +
            "@pe.hasPermission(authentication, null, 'DASHBOARD.VIEW.PAN_INDIA')",
    )
    @Operation(
        summary = "Project activity summary",
        description = "Returns aggregated record-state counts per activity type for a project. " +
            "Reads from project_activity_summary — never from raw records.",
    )
    @ApiResponses(
        ApiResponse(responseCode = "200", description = "Summary returned"),
        ApiResponse(responseCode = "403", description = "Insufficient permission"),
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
    @Operation(
        summary = "Utility shifting subtype breakdown",
        description = "Returns per-utility-type record counts for a project from project_utility_subtype_summary.",
    )
    @ApiResponses(
        ApiResponse(responseCode = "200", description = "Breakdown returned"),
        ApiResponse(responseCode = "403", description = "Insufficient permission"),
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
    @Operation(
        summary = "Forest clearance stage breakdown",
        description = "Returns per-stage workflow counts for Forest Clearance records from project_forest_stage_summary.",
    )
    @ApiResponses(
        ApiResponse(responseCode = "200", description = "Breakdown returned"),
        ApiResponse(responseCode = "403", description = "Insufficient permission"),
    )
    fun getForestStageBreakdown(
        @PathVariable projectId: UUID,
    ): ForestStageBreakdownDto = dashboardService.getForestStageBreakdown(projectId)

    // ── Phase 2.8 — Zone scope dashboard ──────────────────────────────────────

    @GetMapping("/api/v1/dashboard/zone")
    @PreAuthorize(
        "@pe.hasPermission(authentication, null, 'DASHBOARD.VIEW.ZONE') or " +
            "@pe.hasPermission(authentication, null, 'DASHBOARD.VIEW.PAN_INDIA')",
    )
    @Operation(
        summary = "Zone-scope dashboard",
        description =
            "Returns KPI strip and projects list for every zone the calling principal can access. " +
                "A CAO/C of zone X sees one zone entry (zone X). " +
                "A user with cross-zone grants sees one entry per accessible zone. " +
                "KPI counts (projectsActive, totalDrawingsInApproval) are read from zone_summary " +
                "and default to 0 until the first workflow event triggers a cascade update. " +
                "The projects list is always current (live query). " +
                "Gated to DASHBOARD.VIEW.ZONE (CAO/C, Super Admin) or DASHBOARD.VIEW.PAN_INDIA.",
    )
    @ApiResponses(
        ApiResponse(responseCode = "200", description = "Zone dashboard returned"),
        ApiResponse(responseCode = "403", description = "Insufficient permission"),
    )
    fun getZoneDashboard(
        @AuthenticationPrincipal principal: PiaPrincipal,
    ): ZoneDashboardResponse = zoneDashboardService.getZoneDashboard(principal)

    // ── Phase 2.9 — PAN India dashboard ───────────────────────────────────────

    @GetMapping("/api/v1/dashboard/pan-india")
    @PreAuthorize("@pe.hasPermission(authentication, null, 'DASHBOARD.VIEW.PAN_INDIA')")
    @Operation(
        summary = "PAN India dashboard",
        description =
            "Returns system-wide KPI totals and a full zone breakdown for every active zone. " +
                "Top-level KPIs (totalProjectsActive, totalProjectsWithSlaBreaches, " +
                "totalDrawingsInApproval) are read from the singleton pan_india_summary row, " +
                "which is recomputed from zone_summary on every workflow event via SummaryUpdater. " +
                "The zones list matches what GET /api/v1/dashboard/zone returns for a super admin. " +
                "Projects within each zone are a live query — always current. " +
                "Gated to DASHBOARD.VIEW.PAN_INDIA (EDGS/CI, Board Viewer, Super Admin).",
    )
    @ApiResponses(
        ApiResponse(responseCode = "200", description = "PAN India dashboard returned"),
        ApiResponse(responseCode = "403", description = "Insufficient permission"),
    )
    fun getPanIndiaDashboard(): PanIndiaDashboardResponse =
        panIndiaDashboardService.getPanIndiaDashboard()
}
