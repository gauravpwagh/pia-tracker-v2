package `in`.gov.ir.pia.service.project

import `in`.gov.ir.pia.domain.project.Project
import `in`.gov.ir.pia.repository.ProjectRepository
import `in`.gov.ir.pia.security.PiaPrincipal
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

/**
 * Application service for [Project] reads.
 *
 * All access is zone-filtered.  "Zone-filtered" means:
 * - List: returns only projects in the principal's accessible zones,
 *   unless the principal has ALL-scope read access (then returns all).
 * - Detail: returns 404 for any project outside the principal's zones —
 *   even if the project exists — to avoid zone-membership information leaks.
 *
 * Transaction boundaries sit in this service, not in the controller.
 */
@Service
@Transactional(readOnly = true)
class ProjectService(
    private val projectRepository: ProjectRepository,
) {
    /**
     * Returns all projects visible to [principal].
     *
     * - SUPER_ADMIN and ALL-scope holders → all non-deleted projects.
     * - ZONE / OWN-scope holders → projects whose zone is in the principal's
     *   accessible zones.
     * - No readable scope → empty list (the controller's @PreAuthorize will
     *   have already blocked principals with no read permission at all).
     */
    fun listForPrincipal(principal: PiaPrincipal): List<Project> =
        if (principal.isSuperAdmin || principal.permissions.contains("PROJECT.READ.ALL")) {
            projectRepository.findAllByIsDeletedFalse()
        } else {
            val zones = principal.accessibleZoneIds
            if (zones.isEmpty()) {
                emptyList()
            } else {
                projectRepository.findAllByZoneIdInAndIsDeletedFalse(zones)
            }
        }

    /**
     * Returns a single project if [principal] can access it, or throws 404.
     *
     * A principal with ALL-scope can load any non-deleted project.
     * ZONE / OWN-scope principals can only load projects in their zones.
     * Projects in inaccessible zones return 404 (not 403) to prevent
     * zone-membership enumeration.
     */
    fun getForPrincipal(
        id: UUID,
        principal: PiaPrincipal,
    ): Project {
        if (principal.isSuperAdmin || principal.permissions.contains("PROJECT.READ.ALL")) {
            return projectRepository.findByIdAndIsDeletedFalse(id)
                ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        }
        val zones = principal.accessibleZoneIds
        if (zones.isEmpty()) throw ResponseStatusException(HttpStatus.NOT_FOUND)
        return projectRepository.findByIdInZones(id, zones)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
    }
}
