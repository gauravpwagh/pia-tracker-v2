package `in`.gov.ir.pia.api

import `in`.gov.ir.pia.security.PiaPrincipal
import `in`.gov.ir.pia.service.project.ProjectService
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

// ─── DTOs ──────────────────────────────────────────────────────────────────────

data class ProjectSummaryResponse(
    val id: UUID,
    val name: String,
    val zoneId: UUID,
)

// ─── Controller ────────────────────────────────────────────────────────────────

/**
 * REST endpoints for the Project resource.
 *
 * Phase 1.4: list and detail only (zone-filtered read).
 * Phase 1.7 will add create, update, and lifecycle action endpoints.
 *
 * Every method carries `@PreAuthorize` — no exceptions.  Zone-level
 * filtering is enforced by [ProjectService], not by the security expression
 * alone: the permission gate answers "can this user read projects?", while
 * the service answers "which specific projects can this user see?".
 */
@RestController
@RequestMapping("/api/v1/projects")
class ProjectController(
    private val projectService: ProjectService,
) {
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
            .map { ProjectSummaryResponse(it.id, it.name, it.zoneId) }

    /**
     * Returns a single project.
     *
     * Returns 404 (not 403) when the project exists but is outside the
     * caller's accessible zones — to avoid zone-membership enumeration.
     */
    @GetMapping("/{id}")
    @PreAuthorize("@pe.hasPermission(authentication, null, 'PROJECT.READ.OWN')")
    fun get(
        @PathVariable id: UUID,
        @AuthenticationPrincipal principal: PiaPrincipal,
    ): ProjectSummaryResponse {
        val project = projectService.getForPrincipal(id, principal)
        return ProjectSummaryResponse(project.id, project.name, project.zoneId)
    }
}
