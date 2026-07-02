package `in`.gov.ir.pia.api

import `in`.gov.ir.pia.security.PiaPrincipal
import `in`.gov.ir.pia.service.project.AllocateProjectRequest
import `in`.gov.ir.pia.service.project.AssignDyceRequest
import `in`.gov.ir.pia.service.project.CreateProjectRequest
import `in`.gov.ir.pia.service.project.DesignateNodalRequest
import `in`.gov.ir.pia.service.project.DesignatePrimaryCeRequest
import `in`.gov.ir.pia.service.project.ProjectAssignmentItem
import `in`.gov.ir.pia.service.project.ProjectDetailResponse
import `in`.gov.ir.pia.service.project.ProjectHistoryEntry
import `in`.gov.ir.pia.service.project.ProjectService
import `in`.gov.ir.pia.service.project.RemoveProjectRequest
import org.springframework.http.HttpStatus
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

// ─── DTOs ──────────────────────────────────────────────────────────────────────

data class ProjectSummaryResponse(
    val id: UUID,
    val name: String,
    val zoneId: UUID,
    /** Unique project code, e.g. "NR-2024-001". May be null for draft projects. */
    val projectCode: String?,
    val projectType: String?,
    /** Cached lifecycle state for tree display — source of truth is workflow_instances. */
    val lifecycleState: String,
    val chainageFromKm: java.math.BigDecimal?,
    val chainageToKm: java.math.BigDecimal?,
    val lengthKm: java.math.BigDecimal?,
    val ipaDate: java.time.LocalDate?,
    val targetCompletionYear: Int?,
    val createdAt: java.time.Instant,
)

data class NextSerialResponse(
    val serial: String,
)

// ─── Controller ────────────────────────────────────────────────────────────────

/**
 * REST endpoints for the Project resource.
 *
 * Phase 1.4: list and detail only (zone-filtered read).
 * Phase 1.7: create, allocate, assign-dyce, designate-nodal lifecycle actions.
 *
 * Every method carries `@PreAuthorize` — no exceptions.  Zone-level
 * filtering is enforced by [ProjectService], not by the security expression
 * alone: the permission gate answers "can this user perform this action?",
 * while the service answers "on which specific projects?".
 *
 * Action endpoints follow the pattern:
 *   `POST /api/v1/projects/{id}/action-name` (no If-Match in Phase 1.7;
 *   optimistic locking is enforced at the workflow instance level).
 */
@RestController
@RequestMapping("/api/v1/projects")
class ProjectController(
    private val projectService: ProjectService,
) {
    // ── Read ──────────────────────────────────────────────────────────────────

    /**
     * Returns all projects visible to the caller.
     *
     * The [ProjectService] applies zone-level filtering: ZONE / OWN-scope
     * holders see only projects in their accessible zones; ALL-scope holders
     * see everything.
     */
    @GetMapping
    @PreAuthorize("@pe.hasPermission(authentication, null, 'PROJECT.READ.OWN')")
    fun list(
        @AuthenticationPrincipal principal: PiaPrincipal,
    ): List<ProjectSummaryResponse> =
        projectService
            .listForPrincipal(principal)
            .map { p ->
                ProjectSummaryResponse(
                    id = p.id,
                    name = p.name,
                    zoneId = p.zoneId,
                    projectCode = p.projectCode,
                    projectType = p.projectType,
                    lifecycleState = p.lifecycleState,
                    chainageFromKm = p.chainageFromKm,
                    chainageToKm = p.chainageToKm,
                    lengthKm = p.lengthKm,
                    ipaDate = p.ipaDate,
                    targetCompletionYear = p.targetCompletionYear,
                    createdAt = p.createdAt,
                )
            }

    /**
     * Returns a single project with full detail (all business columns).
     *
     * Returns 404 (not 403) when the project exists but is outside the
     * caller's accessible zones — to avoid zone-membership enumeration.
     *
     * `lifecycleState` is taken from the cached column on `projects` (kept in
     * sync by [ProjectLifecycleSyncListener]) rather than reloading the workflow
     * instance, which avoids an extra query on every tree node click.
     */
    @GetMapping("/{id}")
    @PreAuthorize("@pe.hasPermission(authentication, null, 'PROJECT.READ.OWN')")
    fun get(
        @PathVariable id: UUID,
        @AuthenticationPrincipal principal: PiaPrincipal,
    ): ProjectDetailResponse {
        val p = projectService.getForPrincipal(id, principal)
        return ProjectDetailResponse(
            id = p.id,
            name = p.name,
            zoneId = p.zoneId,
            projectCode = p.projectCode,
            projectType = p.projectType,
            divisionId = p.divisionId,
            chainageFromKm = p.chainageFromKm,
            chainageToKm = p.chainageToKm,
            lengthKm = p.lengthKm,
            ipaDate = p.ipaDate,
            recommendedByBoardOn = p.recommendedByBoardOn,
            targetCompletionYear = p.targetCompletionYear,
            lifecycleState = p.lifecycleState,
            createdByUserId = p.createdByUserId,
            updatedByUserId = p.updatedByUserId,
            createdAt = p.createdAt,
            updatedAt = p.updatedAt,
            version = p.version,
        )
    }

    /**
     * Returns all active role assignments on a project (CE_C, DY_CE_C, NODAL_DY_CE_C, CAO_C).
     * Used by the "Allocate", "Assign Dy CE/C", and "Designate Nodal" action pickers.
     */
    @GetMapping("/{id}/assignments")
    @PreAuthorize("@pe.hasPermission(authentication, null, 'PROJECT.READ.OWN')")
    fun listAssignments(
        @PathVariable id: UUID,
        @AuthenticationPrincipal principal: PiaPrincipal,
    ): List<ProjectAssignmentItem> = projectService.listAssignments(id, principal)

    /**
     * Unified audit history for a project: the project's own audit rows, plus
     * everything logged against its activities and their records. The History
     * tab in the workspace renders this directly.
     */
    @GetMapping("/{id}/history")
    @PreAuthorize("@pe.hasPermission(authentication, null, 'PROJECT.READ.OWN')")
    fun history(
        @PathVariable id: UUID,
        @AuthenticationPrincipal principal: PiaPrincipal,
    ): List<ProjectHistoryEntry> = projectService.history(id, principal)

    /**
     * Returns the next serial number for a Project ID prefix (see
     * [ProjectService.nextSerial]). Used by the create-project wizard to
     * auto-fill the last segment of the Project ID as the user picks
     * zone / plan head / year.
     */
    @GetMapping("/next-serial")
    @PreAuthorize("@pe.hasPermission(authentication, null, 'PROJECT.CREATE')")
    fun nextSerial(
        @org.springframework.web.bind.annotation.RequestParam prefix: String,
    ): NextSerialResponse = NextSerialResponse(projectService.nextSerial(prefix))

    // ── Write ─────────────────────────────────────────────────────────────────

    /**
     * EDGS/C-I creates a new project and immediately submits it for allocation.
     *
     * After this call the project is in `AWAITING_CAO_ALLOCATION` state.
     * Returns 201 Created with the full project detail.
     */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("@pe.hasPermission(authentication, null, 'PROJECT.CREATE')")
    fun create(
        @RequestBody request: CreateProjectRequest,
        @AuthenticationPrincipal principal: PiaPrincipal,
    ): ProjectDetailResponse = projectService.create(request, principal)

    /**
     * CAO/C allocates the project to a CE/C user.
     *
     * Advances state: AWAITING_CAO_ALLOCATION → AWAITING_CEC_ASSIGNMENT.
     * Records a CE_C entry in `project_assignments`.
     */
    @PostMapping("/{id}/allocate")
    @PreAuthorize("@pe.hasPermission(authentication, null, 'PROJECT.ALLOCATE')")
    fun allocate(
        @PathVariable id: UUID,
        @RequestBody request: AllocateProjectRequest,
        @AuthenticationPrincipal principal: PiaPrincipal,
    ): ProjectDetailResponse = projectService.allocate(id, request, principal)

    /**
     * CE/C assigns one or more Dy CE/Cs to the project.
     *
     * Advances state: AWAITING_CEC_ASSIGNMENT → ACTIVE.
     * Records DY_CE_C entries in `project_assignments`.
     */
    @PostMapping("/{id}/assign-dyce")
    @PreAuthorize("@pe.hasPermission(authentication, null, 'PROJECT.ASSIGN_DYCE')")
    fun assignDyce(
        @PathVariable id: UUID,
        @RequestBody request: AssignDyceRequest,
        @AuthenticationPrincipal principal: PiaPrincipal,
    ): ProjectDetailResponse = projectService.assignDyce(id, request, principal)

    /**
     * CE/C designates one of the assigned Dy CE/Cs as the Nodal Dy CE/C.
     *
     * Does not advance the workflow (project remains ACTIVE).
     * Deactivates the previous Nodal assignment and grants ROLE_NODAL_DY_CE_C
     * to the new Nodal user.
     */
    /**
     * Super-admin removes a project. Transitions lifecycle to REMOVED.
     * Removed projects are invisible to all non-super-admin users.
     */
    @PostMapping("/{id}/remove")
    @PreAuthorize("@pe.hasPermission(authentication, null, 'PROJECT.CREATE')")
    fun remove(
        @PathVariable id: UUID,
        @RequestBody request: RemoveProjectRequest,
        @AuthenticationPrincipal principal: PiaPrincipal,
    ): ProjectDetailResponse = projectService.removeProject(id, request.reason, principal)

    @PostMapping("/{id}/designate-nodal")
    @PreAuthorize("@pe.hasPermission(authentication, null, 'PROJECT.DESIGNATE_NODAL')")
    fun designateNodal(
        @PathVariable id: UUID,
        @RequestBody request: DesignateNodalRequest,
        @AuthenticationPrincipal principal: PiaPrincipal,
    ): ProjectDetailResponse = projectService.designateNodal(id, request, principal)

    /**
     * CAO/C designates which of the assigned CE/Cs is primary.
     *
     * Does not advance the workflow — the project's lifecycle state is unchanged.
     */
    @PostMapping("/{id}/designate-primary-ce")
    @PreAuthorize("@pe.hasPermission(authentication, null, 'PROJECT.DESIGNATE_PRIMARY_CE')")
    fun designatePrimaryCe(
        @PathVariable id: UUID,
        @RequestBody request: DesignatePrimaryCeRequest,
        @AuthenticationPrincipal principal: PiaPrincipal,
    ): ProjectDetailResponse = projectService.designatePrimaryCe(id, request, principal)
}
