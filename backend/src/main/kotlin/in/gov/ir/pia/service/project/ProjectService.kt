package `in`.gov.ir.pia.service.project

import `in`.gov.ir.pia.audit.AuditLogWriter
import `in`.gov.ir.pia.domain.project.Project
import `in`.gov.ir.pia.domain.project.ProjectAssignment
import `in`.gov.ir.pia.repository.ProjectAssignmentRepository
import `in`.gov.ir.pia.repository.ProjectRepository
import `in`.gov.ir.pia.repository.UserRepository
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
    val ipaDate: LocalDate? = null,
    val recommendedByBoardOn: LocalDate? = null,
    val targetCompletionYear: Int? = null,
)

data class RemoveProjectRequest(
    val reason: String,
)

data class AllocateProjectRequest(
    /** User IDs of the CE/Cs to allocate this project to. At least one required. */
    val ceUserIds: List<UUID>,
    /** Which of [ceUserIds] is primary. Defaults to the first entry if omitted. */
    val primaryCeUserId: UUID? = null,
)

data class AssignDyceRequest(
    /** User IDs of the Dy CE/Cs to assign. At least one required. */
    val dyceUserIds: List<UUID>,
)

data class DesignateNodalRequest(
    /** User ID of the Dy CE/C to designate as Nodal. Must already be a DY_CE_C on this project. */
    val nodalUserId: UUID,
)

data class DesignatePrimaryCeRequest(
    /** User ID of the CE/C to designate as primary. Must already be a CE_C on this project. */
    val primaryCeUserId: UUID,
)

// ── Response model ─────────────────────────────────────────────────────────────

data class ProjectHistoryEntry(
    val at: Instant,
    val actorName: String?,
    val action: String,
    val entityType: String,
    val details: String?,
)

/** One KMZ file uploaded to a project's Land-Acquisition checklist (map view). */
data class ProjectKmzFile(
    val attachmentId: UUID,
    val filename: String,
    val sizeBytes: Long,
    val recordId: UUID,
    val recordName: String?,
    val createdAt: Instant,
)

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
    val ipaDate: LocalDate?,
    val stationNames: String?,
    val recommendedByBoardOn: LocalDate?,
    val targetCompletionYear: Int?,
    val lifecycleState: String,
    val createdByUserId: UUID?,
    val updatedByUserId: UUID?,
    val createdAt: Instant,
    val updatedAt: Instant,
    val version: Int,
)

/**
 * Editable "Project Details" fields on the Overview panel (#8). Deliberately narrow —
 * Length and Station names only. Everything else (name, code, type, zone, lifecycle)
 * is set at project creation or via the dedicated lifecycle/assignment actions.
 */
data class UpdateProjectDetailsRequest(
    val lengthKm: BigDecimal? = null,
    val stationNames: String? = null,
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
    private val entityManager: jakarta.persistence.EntityManager,
) {
    // ── Read ──────────────────────────────────────────────────────────────────

    /**
     * Returns all projects visible to [principal].
     *
     * Scope rules:
     * - SUPER_ADMIN / PROJECT.READ.ALL → all non-deleted projects.
     * - PROJECT.READ.ZONE (CAO/C)      → projects in accessible zones.
     * - PROJECT.READ.OWN (CE/C, Dy CE/C, Nodal) → projects the user is
     *   actively assigned to via [project_assignments].
     */
    fun listForPrincipal(principal: PiaPrincipal): List<Project> {
        val all = when {
            principal.isSuperAdmin || principal.permissions.contains("PROJECT.READ.ALL") ->
                projectRepository.findAllByIsDeletedFalseOrderByCreatedAtDesc()

            principal.permissions.contains("PROJECT.READ.ZONE") -> {
                val zones = principal.accessibleZoneIds
                if (zones.isEmpty()) emptyList()
                else projectRepository.findAllByZoneIdInAndIsDeletedFalse(zones)
            }

            else -> projectRepository.findAllByAssignedUser(principal.userId)
        }
        return if (principal.isSuperAdmin) all
        else all.filter { it.lifecycleState != "REMOVED" }
    }

    /**
     * Returns a single project if [principal] can access it, or throws 404.
     *
     * Scope rules mirror [listForPrincipal]:
     * - ALL-scope → any non-deleted project.
     * - ZONE-scope → project must be in an accessible zone.
     * - OWN-scope → user must have an active assignment on the project.
     *
     * Always returns 404 (not 403) for inaccessible projects to prevent
     * zone/assignment enumeration.
     */
    fun getForPrincipal(
        id: UUID,
        principal: PiaPrincipal,
    ): Project {
        if (principal.isSuperAdmin || principal.permissions.contains("PROJECT.READ.ALL")) {
            val project = projectRepository.findByIdAndIsDeletedFalse(id)
                ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
            // Non-super-admins cannot see REMOVED projects
            if (!principal.isSuperAdmin && project.lifecycleState == "REMOVED")
                throw ResponseStatusException(HttpStatus.NOT_FOUND)
            return project
        }
        if (principal.permissions.contains("PROJECT.READ.ZONE")) {
            val zones = principal.accessibleZoneIds
            if (zones.isEmpty()) throw ResponseStatusException(HttpStatus.NOT_FOUND)
            val project = projectRepository.findByIdInZones(id, zones)
                ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
            if (project.lifecycleState == "REMOVED") throw ResponseStatusException(HttpStatus.NOT_FOUND)
            return project
        }
        // PROJECT.READ.OWN: must have an active assignment; REMOVED never shown
        val project = projectRepository.findByIdAndAssignedUser(id, principal.userId)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        if (project.lifecycleState == "REMOVED") throw ResponseStatusException(HttpStatus.NOT_FOUND)
        return project
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

    /**
     * Unified audit history for a project: its own audit rows, plus everything
     * logged against its activities and their records (each of those is a
     * separate `entity_type` in `audit_log`, keyed by its own id — not the
     * project's — so a plain per-entity query, which is all [AuditController]
     * offers, can't show a project-wide timeline).
     */
    fun history(
        projectId: UUID,
        principal: PiaPrincipal,
    ): List<ProjectHistoryEntry> {
        getForPrincipal(projectId, principal) // zone-check; throws 404 if inaccessible
        return jdbc.query(
            """
            SELECT al.at, u.name AS actor_name, al.action, al.entity_type,
                   al.change_summary_json::text AS details
              FROM audit_log al
              LEFT JOIN users u ON u.id = al.actor_user_id
             WHERE (al.entity_type = 'PROJECT' AND al.entity_id = ?)
                OR (al.entity_type IN ('ACTIVITY', 'PROJECT_ACTIVITY') AND al.entity_id IN (
                        SELECT id FROM project_activities WHERE project_id = ?))
                OR (al.entity_type = 'ACTIVITY_RECORD' AND al.entity_id IN (
                        SELECT ar.id FROM activity_records ar
                          JOIN project_activities pa ON pa.id = ar.project_activity_id
                         WHERE pa.project_id = ?))
             ORDER BY al.at DESC
             LIMIT 500
            """.trimIndent(),
            { rs, _ ->
                ProjectHistoryEntry(
                    at = rs.getTimestamp("at").toInstant(),
                    actorName = rs.getString("actor_name"),
                    action = rs.getString("action"),
                    entityType = rs.getString("entity_type"),
                    details = rs.getString("details"),
                )
            },
            projectId,
            projectId,
            projectId,
        )
    }

    /**
     * All KMZ files uploaded to this project's Land-Acquisition scope Checklist
     * ("KMZ File" field). Field-scoped attachments live under
     * `entity_type = 'PROJECT_ACTIVITY__kmz_file'` with `entity_id = activity id`
     * (the checklist moved from the per-record view to the Activity Scope). Only
     * clean (virus-scanned), non-deleted files are returned; the map view downloads
     * each via the normal attachment-download route and parses it (KMZ → GeoJSON)
     * client-side. `recordId`/`recordName` carry the owning activity's id/name.
     */
    fun listKmzFiles(
        projectId: UUID,
        principal: PiaPrincipal,
    ): List<ProjectKmzFile> {
        getForPrincipal(projectId, principal) // zone-check; throws 404 if inaccessible
        return jdbc.query(
            """
            SELECT a.id, a.original_filename, a.file_size_bytes,
                   a.entity_id AS record_id, pa.name AS record_name, a.created_at
              FROM attachments a
              JOIN project_activities pa ON pa.id = a.entity_id
             WHERE a.entity_type = 'PROJECT_ACTIVITY__kmz_file'
               AND a.is_deleted = false
               AND a.scan_status = 'CLEAN'
               AND pa.project_id = ?
             ORDER BY a.created_at DESC
            """.trimIndent(),
            { rs, _ ->
                ProjectKmzFile(
                    attachmentId = rs.getObject("id", UUID::class.java),
                    filename = rs.getString("original_filename"),
                    sizeBytes = rs.getLong("file_size_bytes"),
                    recordId = rs.getObject("record_id", UUID::class.java),
                    recordName = rs.getString("record_name"),
                    createdAt = rs.getTimestamp("created_at").toInstant(),
                )
            },
            projectId,
        )
    }

    /**
     * Returns the next serial number (3-digit, 1-based) for the given Project ID
     * prefix, e.g. prefix "01.00.11.26.1.00." -> "007" if 6 projects already
     * exist with that prefix. Used to auto-fill the last segment of the
     * Project ID in the create-project wizard.
     */
    fun nextSerial(prefix: String): String {
        // The wizard composes the full code as "pia.<prefix><serial>", so the
        // stored project_code always begins with "pia." + prefix. Match on that
        // full form — matching on the bare prefix never hits (codes start with
        // "pia."), which made the count always 0 and every project in a prefix
        // collide on the "001" serial.
        val count = jdbc.queryForObject(
            "SELECT COUNT(*) FROM projects WHERE project_code LIKE 'pia.' || ? || '%'",
            Int::class.java,
            prefix,
        ) ?: 0
        return (count + 1).toString().padStart(3, '0')
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
        val hasAllZoneAccess = principal.isSuperAdmin || principal.permissions.contains("PROJECT.READ.ALL")
        if (!hasAllZoneAccess && !principal.canAccessZone(request.zoneId)) {
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
                ipaDate = request.ipaDate,
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
     * CAO/C allocates the project to one or more CE/Cs, nominating one as primary.
     *
     * Advances the workflow: AWAITING_CAO_ALLOCATION → AWAITING_CEC_ASSIGNMENT — but
     * only on the first call; a subsequent call (re-allocating / changing the CE set)
     * finds the workflow already past that state and just updates the assignments,
     * mirroring how [designateNodal] never advances the workflow. This keeps the door
     * open for a future "CAO/C changes the CE/C set" action without a schema change.
     *
     * Inserts a CE_C row for each requested user, skipping ones already active
     * (idempotent for re-calls with an overlapping user set), then delegates the
     * primary flag to [designatePrimaryCe].
     */
    @Transactional
    fun allocate(
        projectId: UUID,
        request: AllocateProjectRequest,
        principal: PiaPrincipal,
    ): ProjectDetailResponse {
        if (request.ceUserIds.isEmpty()) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "At least one ceUserId is required")
        }
        val primaryCeUserId = request.primaryCeUserId ?: request.ceUserIds.first()
        if (primaryCeUserId !in request.ceUserIds) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "primaryCeUserId must be one of ceUserIds")
        }

        val project = getForPrincipal(projectId, principal)
        val wfInstanceId = instanceIdForProject(projectId)

        val existingCes =
            assignmentRepository
                .findAllByProjectIdAndAssignmentRoleAndIsActiveTrue(projectId, "CE_C")
                .map { it.userId }
                .toSet()
        val removedCes = existingCes - request.ceUserIds.toSet()

        request.ceUserIds
            .filter { it !in existingCes }
            .forEach { ceUserId -> upsertAssignment(project.id, ceUserId, "CE_C", principal.userId) }

        // CE/Cs dropped from the selection are deactivated (not deleted, so
        // re-adding them later goes through the reactivate path above, never
        // hitting the unique-constraint bug this replaces).
        removedCes.forEach { ceUserId -> deactivateAssignment(project.id, ceUserId, "CE_C") }

        val currentState = workflowService.currentState("PROJECT", projectId)?.code ?: project.lifecycleState
        val lifecycleState =
            if (currentState == "AWAITING_CAO_ALLOCATION") {
                workflowService.transition(wfInstanceId, "allocate", principal).currentState.code
            } else {
                currentState
            }

        auditLogWriter.write(
            actorUserId = principal.userId,
            action = "PROJECT.ALLOCATE",
            entityType = "PROJECT",
            entityId = project.id,
        )

        designatePrimaryCeInternal(project.id, primaryCeUserId, principal)

        return project.toDetailResponse(lifecycleState = lifecycleState)
    }

    /**
     * CAO/C designates which of the assigned CE/Cs is primary.
     *
     * Mirrors [designateNodal]: deactivates the previous PRIMARY_CE_C assignment (if
     * any) and inserts a new one. Unlike Nodal, primary doesn't carry extra
     * permissions — all CE/Cs already have the full CE/C permission set via their
     * designation's default role — so no `user_roles` grant is needed here.
     * Does **not** advance the workflow.
     */
    @Transactional
    fun designatePrimaryCe(
        projectId: UUID,
        request: DesignatePrimaryCeRequest,
        principal: PiaPrincipal,
    ): ProjectDetailResponse {
        val project = getForPrincipal(projectId, principal)
        val activeCes =
            assignmentRepository
                .findAllByProjectIdAndAssignmentRoleAndIsActiveTrue(projectId, "CE_C")
                .map { it.userId }
                .toSet()
        if (request.primaryCeUserId !in activeCes) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "primaryCeUserId must be an assigned CE/C on this project")
        }

        designatePrimaryCeInternal(project.id, request.primaryCeUserId, principal)

        auditLogWriter.write(
            actorUserId = principal.userId,
            action = "PROJECT.DESIGNATE_PRIMARY_CE",
            entityType = "PROJECT",
            entityId = project.id,
        )

        val currentLifecycle = workflowService.currentState("PROJECT", projectId)?.code ?: project.lifecycleState
        return project.toDetailResponse(lifecycleState = currentLifecycle)
    }

    private fun designatePrimaryCeInternal(
        projectId: UUID,
        primaryCeUserId: UUID,
        principal: PiaPrincipal,
    ) {
        val existingPrimary =
            assignmentRepository.findAllByProjectIdAndAssignmentRoleAndIsActiveTrue(projectId, "PRIMARY_CE_C").firstOrNull()
        if (existingPrimary?.userId == primaryCeUserId) return // already primary — nothing to do

        if (existingPrimary != null) {
            jdbc.update(
                """
                UPDATE project_assignments
                   SET is_active = false, deactivated_at = ?
                 WHERE id = ?
                """.trimIndent(),
                java.sql.Timestamp.from(Instant.now()),
                existingPrimary.id,
            )
        }

        upsertAssignment(projectId, primaryCeUserId, "PRIMARY_CE_C", principal.userId)
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
        val removedDyces = existingDyces - request.dyceUserIds.toSet()

        request.dyceUserIds
            .filter { it !in existingDyces }
            .forEach { dyceUserId -> upsertAssignment(project.id, dyceUserId, "DY_CE_C", principal.userId) }

        // Dy CE/Cs dropped from the selection are deactivated. If the removed user
        // was the Nodal, drop that designation too (and its extra permission grant).
        removedDyces.forEach { dyceUserId ->
            deactivateAssignment(project.id, dyceUserId, "DY_CE_C")
            val wasNodal = assignmentRepository.findActiveNodalForProject(project.id)?.userId == dyceUserId
            if (wasNodal) {
                deactivateAssignment(project.id, dyceUserId, "NODAL_DY_CE_C")
                jdbc.update("DELETE FROM user_roles WHERE user_id = ? AND role_code = 'ROLE_NODAL_DY_CE_C'", dyceUserId)
            }
        }

        // Only advance on the first call — a later re-call (adding/changing Dy CE/Cs
        // once already ACTIVE) just updates the assignments, mirroring allocate().
        val currentState = workflowService.currentState("PROJECT", projectId)?.code ?: project.lifecycleState
        val lifecycleState =
            if (currentState == "AWAITING_CEC_ASSIGNMENT") {
                workflowService.transition(wfInstanceId, "assign_dyces", principal).currentState.code
            } else {
                currentState
            }

        auditLogWriter.write(
            actorUserId = principal.userId,
            action = "PROJECT.ASSIGN_DYCE",
            entityType = "PROJECT",
            entityId = project.id,
        )

        return project.toDetailResponse(lifecycleState = lifecycleState)
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
        // If re-designating the SAME user who's already nodal, there's nothing to do —
        // skip straight through so step 3's upsert doesn't chase its own tail.
        if (existingNodal != null && existingNodal.userId != request.nodalUserId) {
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

        // 3: Insert (or reactivate) the NODAL_DY_CE_C assignment for the new nodal.
        upsertAssignment(project.id, request.nodalUserId, "NODAL_DY_CE_C", principal.userId)

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

    /**
     * Updates the editable "Project Details" fields on the Overview panel (#8):
     * Length (km) and Station names. Everything else about a project is set at
     * creation or via the dedicated lifecycle/assignment actions — this endpoint
     * deliberately does not touch name, code, type, zone, or lifecycle state.
     *
     * Access: [getForPrincipal] proves the caller can see the project (their own
     * assignment, zone, or ALL scope); `@PreAuthorize PROJECT.UPDATE.OWN` on the
     * controller method further restricts *who* may call this at all (CE/C, Dy
     * CE/C, Nodal Dy CE/C, EDGS/CI, super admin).
     */
    @Transactional
    fun updateDetails(
        projectId: UUID,
        request: UpdateProjectDetailsRequest,
        principal: PiaPrincipal,
    ): ProjectDetailResponse {
        val project = getForPrincipal(projectId, principal)

        jdbc.update(
            """
            UPDATE projects
               SET length_km          = ?,
                   station_names      = ?,
                   updated_by_user_id = ?,
                   updated_at         = now(),
                   version            = version + 1
             WHERE id = ? AND is_deleted = false
            """.trimIndent(),
            request.lengthKm,
            request.stationNames,
            principal.userId,
            projectId,
        )

        auditLogWriter.write(
            actorUserId = principal.userId,
            action = "PROJECT.UPDATE_DETAILS",
            entityType = "PROJECT",
            entityId = project.id,
        )

        // getForPrincipal above loaded this Project via JPA — clear the L1 cache so the
        // re-fetch below sees the jdbc UPDATE just written, not a stale cached instance.
        entityManager.clear()
        val updated =
            projectRepository.findByIdAndIsDeletedFalse(projectId)
                ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        val currentLifecycle =
            workflowService.currentState("PROJECT", projectId)?.code
                ?: updated.lifecycleState
        return updated.toDetailResponse(lifecycleState = currentLifecycle)
    }

    /**
     * Super-admin removes a project. Transitions the workflow to REMOVED state.
     * Removed projects are hidden from all non-super-admin users.
     */
    @Transactional
    fun removeProject(
        projectId: UUID,
        reason: String,
        principal: PiaPrincipal,
    ): ProjectDetailResponse {
        if (!principal.isSuperAdmin) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only super admin can remove projects")
        }
        val project = projectRepository.findByIdAndIsDeletedFalse(projectId)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)

        val wfInstanceId = instanceIdForProject(projectId)
        val advanced = workflowService.transition(wfInstanceId, "remove", principal, comment = reason)

        auditLogWriter.write(
            actorUserId = principal.userId,
            action = "PROJECT.REMOVE",
            entityType = "PROJECT",
            entityId = project.id,
        )

        return project.toDetailResponse(lifecycleState = advanced.currentState.code)
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    /**
     * Inserts a `project_assignments` row for (projectId, userId, role), or
     * reactivates the existing one if it already exists (active or not).
     *
     * `project_assignments` has `unique (project_id, user_id, assignment_role)`
     * with NO partial/is_active filter, so a naive "deactivate old row, INSERT a
     * new one" sequence throws a unique-constraint violation the moment the same
     * user is re-designated (e.g. re-picking the same Nodal, or re-adding a Dy
     * CE/C who was previously removed) — the old, now-inactive row still holds
     * the key. Reactivating in place avoids that entirely.
     */
    private fun upsertAssignment(
        projectId: UUID,
        userId: UUID,
        role: String,
        assignedByUserId: UUID,
    ) {
        val rowsUpdated =
            jdbc.update(
                """
                UPDATE project_assignments
                   SET is_active = true, deactivated_at = null,
                       assigned_by_user_id = ?, assigned_at = now()
                 WHERE project_id = ? AND user_id = ? AND assignment_role = ?
                """.trimIndent(),
                assignedByUserId,
                projectId,
                userId,
                role,
            )
        if (rowsUpdated == 0) {
            assignmentRepository.save(
                ProjectAssignment(
                    projectId = projectId,
                    userId = userId,
                    assignmentRole = role,
                    assignedByUserId = assignedByUserId,
                ),
            )
        }
    }

    private fun deactivateAssignment(
        projectId: UUID,
        userId: UUID,
        role: String,
    ) {
        jdbc.update(
            """
            UPDATE project_assignments
               SET is_active = false, deactivated_at = ?
             WHERE project_id = ? AND user_id = ? AND assignment_role = ? AND is_active = true
            """.trimIndent(),
            java.sql.Timestamp.from(Instant.now()),
            projectId,
            userId,
            role,
        )
    }

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
            ipaDate = ipaDate,
            stationNames = stationNames,
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
