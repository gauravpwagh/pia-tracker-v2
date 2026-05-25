package `in`.gov.ir.pia.service.project

import `in`.gov.ir.pia.audit.AuditLogWriter
import `in`.gov.ir.pia.domain.project.Project
import `in`.gov.ir.pia.domain.project.ProjectAssignment
import `in`.gov.ir.pia.repository.ProjectAssignmentRepository
import `in`.gov.ir.pia.repository.ProjectRepository
import `in`.gov.ir.pia.security.PiaPrincipal
import `in`.gov.ir.pia.workflow.WorkflowService
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

// ── Request models ─────────────────────────────────────────────────────────────

data class CreateProjectRequest(
    val name: String,
    val zoneId: UUID,
    val projectCode: String? = null,
    val projectType: String? = null,
    val divisionId: UUID? = null,
    val chainageFromKm: BigDecimal? = null,
    val chainageToKm: BigDecimal? = null,
    val lengthKm: BigDecimal? = null,
    val recommendedByBoardOn: LocalDate? = null,
    val targetCompletionYear: Int? = null,
)

data class AllocateProjectRequest(
    /** User ID of the CE/C to allocate this project to. */
    val ceUserId: UUID,
)

data class AssignDyceRequest(
    /** User IDs of the Dy CE/Cs to assign. At least one required. */
    val dyceUserIds: List<UUID>,
)

data class DesignateNodalRequest(
    /** User ID of the Dy CE/C to designate as Nodal. Must already be a DY_CE_C on this project. */
    val nodalUserId: UUID,
)

// ── Response model ─────────────────────────────────────────────────────────────

data class ProjectAssignmentItem(
    val id: UUID,
    val userId: UUID,
    val assignmentRole: String,
    val assignedAt: java.time.Instant,
    val isActive: Boolean,
)

data class ProjectDetailResponse(
    val id: UUID,
    val name: String,
    val zoneId: UUID,
    val projectCode: String?,
    val projectType: String?,
    val divisionId: UUID?,
    val chainageFromKm: BigDecimal?,
    val chainageToKm: BigDecimal?,
    val lengthKm: BigDecimal?,
    val recommendedByBoardOn: LocalDate?,
    val targetCompletionYear: Int?,
    val lifecycleState: String,
    val createdByUserId: UUID?,
    val updatedByUserId: UUID?,
    val createdAt: Instant,
    val updatedAt: Instant,
    val version: Int,
)

// ── Service ────────────────────────────────────────────────────────────────────

/**
 * Application service for [Project] reads and lifecycle actions.
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
    private val assignmentRepository: ProjectAssignmentRepository,
    private val workflowService: WorkflowService,
    private val auditLogWriter: AuditLogWriter,
    private val jdbc: JdbcTemplate,
) {
    // ── Read ──────────────────────────────────────────────────────────────────

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
            projectRepository.findAllByIsDeletedFalseOrderByCreatedAtDesc()
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

    /**
     * Returns all active assignments for a project visible to [principal].
     * Zone access is enforced by [getForPrincipal] before returning.
     */
    fun listAssignments(
        projectId: UUID,
        principal: PiaPrincipal,
    ): List<ProjectAssignmentItem> {
        getForPrincipal(projectId, principal) // zone-check; throws 404 if inaccessible
        return assignmentRepository
            .findAllByProjectIdAndIsActiveTrue(projectId)
            .map {
                ProjectAssignmentItem(
                    id = it.id,
                    userId = it.userId,
                    assignmentRole = it.assignmentRole,
                    assignedAt = it.assignedAt,
                    isActive = it.isActive,
                )
            }
    }

    // ── Write ─────────────────────────────────────────────────────────────────

    /**
     * Creates a new project and immediately submits it for CAO/C allocation.
     *
     * Steps (single transaction):
     * 1. Validate zone access.
     * 2. Persist the [Project] entity in DRAFT state.
     * 3. Start a PROJECT_LIFECYCLE_V1 workflow instance.
     * 4. Transition DRAFT → AWAITING_CAO_ALLOCATION via the "submit" action.
     *    [ProjectLifecycleSyncListener] updates `projects.lifecycle_state` in
     *    the same transaction.
     * 5. Write an audit log row.
     * 6. Return a [ProjectDetailResponse] — the lifecycle state is taken from
     *    the workflow result to avoid reloading the JPA entity (which would
     *    return the stale DRAFT value from the L1 cache).
     *
     * @throws ResponseStatusException 403 if [principal] cannot access [zoneId]
     */
    @Transactional
    fun create(
        request: CreateProjectRequest,
        principal: PiaPrincipal,
    ): ProjectDetailResponse {
        if (!principal.isSuperAdmin && !principal.canAccessZone(request.zoneId)) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Zone not accessible")
        }

        val project =
            Project(
                zoneId = request.zoneId,
                name = request.name,
                projectCode = request.projectCode,
                projectType = request.projectType,
                divisionId = request.divisionId,
                chainageFromKm = request.chainageFromKm,
                chainageToKm = request.chainageToKm,
                lengthKm = request.lengthKm,
                recommendedByBoardOn = request.recommendedByBoardOn,
                targetCompletionYear = request.targetCompletionYear,
                createdByUserId = principal.userId,
                updatedByUserId = principal.userId,
            )
        // saveAndFlush ensures the INSERT is visible to the subsequent JdbcTemplate
        // UPDATE in ProjectLifecycleSyncListener; save() alone defers the flush
        // and the listener would update 0 rows.
        projectRepository.saveAndFlush(project)

        // Start workflow and immediately advance to AWAITING_CAO_ALLOCATION.
        val instance = workflowService.start("PROJECT_LIFECYCLE_V1", "PROJECT", project.id)
        val advanced = workflowService.transition(instance.id, "submit", principal)

        auditLogWriter.write(
            actorUserId = principal.userId,
            action = "PROJECT.CREATE",
            entityType = "PROJECT",
            entityId = project.id,
        )

        return project.toDetailResponse(lifecycleState = advanced.currentState.code)
    }

    /**
     * CAO/C allocates the project to a CE/C.
     *
     * Advances the workflow: AWAITING_CAO_ALLOCATION → AWAITING_CEC_ASSIGNMENT.
     * Inserts a CE_C row into `project_assignments`.
     */
    @Transactional
    fun allocate(
        projectId: UUID,
        request: AllocateProjectRequest,
        principal: PiaPrincipal,
    ): ProjectDetailResponse {
        val project = getForPrincipal(projectId, principal)
        val wfInstanceId = instanceIdForProject(projectId)
        val advanced = workflowService.transition(wfInstanceId, "allocate", principal)

        assignmentRepository.save(
            ProjectAssignment(
                projectId = project.id,
                userId = request.ceUserId,
                assignmentRole = "CE_C",
                assignedByUserId = principal.userId,
            ),
        )

        auditLogWriter.write(
            actorUserId = principal.userId,
            action = "PROJECT.ALLOCATE",
            entityType = "PROJECT",
            entityId = project.id,
        )

        return project.toDetailResponse(lifecycleState = advanced.currentState.code)
    }

    /**
     * CE/C assigns one or more Dy CE/Cs to the project.
     *
     * Advances the workflow: AWAITING_CEC_ASSIGNMENT → ACTIVE.
     * Inserts a DY_CE_C row for each user in `project_assignments`.
     * Skips users that already have an active DY_CE_C assignment on this project
     * (idempotent for re-calls with the same user set).
     */
    @Transactional
    fun assignDyce(
        projectId: UUID,
        request: AssignDyceRequest,
        principal: PiaPrincipal,
    ): ProjectDetailResponse {
        if (request.dyceUserIds.isEmpty()) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "At least one dyceUserId is required")
        }

        val project = getForPrincipal(projectId, principal)
        val wfInstanceId = instanceIdForProject(projectId)

        val existingDyces =
            assignmentRepository
                .findAllByProjectIdAndAssignmentRoleAndIsActiveTrue(projectId, "DY_CE_C")
                .map { it.userId }
                .toSet()

        request.dyceUserIds
            .filter { it !in existingDyces }
            .forEach { dyceUserId ->
                assignmentRepository.save(
                    ProjectAssignment(
                        projectId = project.id,
                        userId = dyceUserId,
                        assignmentRole = "DY_CE_C",
                        assignedByUserId = principal.userId,
                    ),
                )
            }

        val advanced = workflowService.transition(wfInstanceId, "assign_dyces", principal)

        auditLogWriter.write(
            actorUserId = principal.userId,
            action = "PROJECT.ASSIGN_DYCE",
            entityType = "PROJECT",
            entityId = project.id,
        )

        return project.toDetailResponse(lifecycleState = advanced.currentState.code)
    }

    /**
     * CE/C designates one of the assigned Dy CE/Cs as the Nodal Dy CE/C.
     *
     * Steps:
     * 1. Deactivate any existing NODAL_DY_CE_C assignment (JdbcTemplate).
     * 2. Remove ROLE_NODAL_DY_CE_C from the old Nodal's `user_roles` (if any).
     * 3. Insert a new NODAL_DY_CE_C assignment for [nodalUserId].
     * 4. Grant ROLE_NODAL_DY_CE_C to [nodalUserId] in `user_roles` (ON CONFLICT
     *    DO NOTHING — idempotent).
     * 5. Write audit log.
     *
     * Does **not** advance the workflow — the project stays in ACTIVE state.
     */
    @Transactional
    fun designateNodal(
        projectId: UUID,
        request: DesignateNodalRequest,
        principal: PiaPrincipal,
    ): ProjectDetailResponse {
        val project = getForPrincipal(projectId, principal)

        // 1 & 2: Deactivate old Nodal and revoke their system role
        val existingNodal = assignmentRepository.findActiveNodalForProject(projectId)
        if (existingNodal != null) {
            jdbc.update(
                """
                UPDATE project_assignments
                   SET is_active = false, deactivated_at = ?
                 WHERE id = ?
                """.trimIndent(),
                java.sql.Timestamp.from(Instant.now()),
                existingNodal.id,
            )
            // Remove ROLE_NODAL_DY_CE_C from old nodal's user_roles
            jdbc.update(
                "DELETE FROM user_roles WHERE user_id = ? AND role_code = 'ROLE_NODAL_DY_CE_C'",
                existingNodal.userId,
            )
        }

        // 3: Insert new NODAL_DY_CE_C assignment
        assignmentRepository.save(
            ProjectAssignment(
                projectId = project.id,
                userId = request.nodalUserId,
                assignmentRole = "NODAL_DY_CE_C",
                assignedByUserId = principal.userId,
            ),
        )

        // 4: Grant ROLE_NODAL_DY_CE_C to the new Nodal (idempotent)
        jdbc.update(
            """
            INSERT INTO user_roles (user_id, role_code, granted_by_user_id)
            VALUES (?, 'ROLE_NODAL_DY_CE_C', ?)
            ON CONFLICT (user_id, role_code) DO NOTHING
            """.trimIndent(),
            request.nodalUserId,
            principal.userId,
        )

        auditLogWriter.write(
            actorUserId = principal.userId,
            action = "PROJECT.DESIGNATE_NODAL",
            entityType = "PROJECT",
            entityId = project.id,
        )

        // lifecycle_state is unchanged (project remains ACTIVE)
        val currentLifecycle =
            workflowService.currentState("PROJECT", projectId)?.code
                ?: project.lifecycleState

        return project.toDetailResponse(lifecycleState = currentLifecycle)
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    /**
     * Retrieves the workflow instance ID for a project.
     * Throws 404 if no instance exists (should not happen for a properly created project).
     */
    private fun instanceIdForProject(projectId: UUID): UUID =
        jdbc
            .queryForList(
                "SELECT id FROM workflow_instances " +
                    "WHERE entity_type = 'PROJECT' AND entity_id = ? AND section_code IS NULL",
                UUID::class.java,
                projectId,
            ).firstOrNull()
            ?: throw ResponseStatusException(
                HttpStatus.NOT_FOUND,
                "No workflow instance for project $projectId",
            )

    private fun Project.toDetailResponse(lifecycleState: String): ProjectDetailResponse =
        ProjectDetailResponse(
            id = id,
            name = name,
            zoneId = zoneId,
            projectCode = projectCode,
            projectType = projectType,
            divisionId = divisionId,
            chainageFromKm = chainageFromKm,
            chainageToKm = chainageToKm,
            lengthKm = lengthKm,
            recommendedByBoardOn = recommendedByBoardOn,
            targetCompletionYear = targetCompletionYear,
            lifecycleState = lifecycleState,
            createdByUserId = createdByUserId,
            updatedByUserId = updatedByUserId,
            createdAt = createdAt,
            updatedAt = updatedAt,
            version = version,
        )
}
