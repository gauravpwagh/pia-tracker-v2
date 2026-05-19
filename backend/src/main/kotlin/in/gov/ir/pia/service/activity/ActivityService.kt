package `in`.gov.ir.pia.service.activity

import `in`.gov.ir.pia.audit.AuditLogWriter
import `in`.gov.ir.pia.domain.activity.ActivityRecord
import `in`.gov.ir.pia.domain.activity.ProjectActivity
import `in`.gov.ir.pia.repository.ActivityRecordRepository
import `in`.gov.ir.pia.repository.FormDefinitionRepository
import `in`.gov.ir.pia.repository.ProjectActivityRepository
import `in`.gov.ir.pia.repository.ProjectAssignmentRepository
import `in`.gov.ir.pia.repository.ProjectRepository
import `in`.gov.ir.pia.security.PiaPrincipal
import com.fasterxml.jackson.databind.node.JsonNodeFactory
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

// ── Request / Response models ──────────────────────────────────────────────────

data class CreateActivityRequest(
    val activityTypeCode: String,
    val name: String,
    val scopeNotes: String? = null,
    val targetCompletionDate: LocalDate? = null,
)

data class CreateActivityRecordRequest(
    val recordSubtype: String? = null,
)

data class ActivityDetailResponse(
    val id: UUID,
    val projectId: UUID,
    val activityTypeCode: String,
    val name: String,
    val scopeNotes: String?,
    val targetCompletionDate: LocalDate?,
    val primaryDyceUserId: UUID,
    val status: String,
    val defaultFormDefinitionId: UUID?,
    val createdByUserId: UUID,
    val createdAt: Instant,
    val updatedAt: Instant,
    val version: Int,
)

data class ActivityRecordDetailResponse(
    val id: UUID,
    val projectActivityId: UUID,
    val formDefinitionId: UUID,
    val schemaVersionAtSave: Int,
    val recordState: String,
    val recordSubtype: String?,
    val createdByUserId: UUID,
    val createdAt: Instant,
    val updatedAt: Instant,
    val version: Int,
)

// ── Service ────────────────────────────────────────────────────────────────────

/**
 * Application service for [ProjectActivity] and [ActivityRecord].
 *
 * ## Assignment gate
 *
 * Creating an activity requires the caller to be an **active DY_CE_C or
 * NODAL_DY_CE_C** on the target project (checked via `project_assignments`).
 * The `@PreAuthorize` annotation on the controller verifies the
 * `ACTIVITY.CREATE.ASSIGNED` permission code; this service performs the
 * project-specific assignment check and returns 403 if not assigned.
 *
 * ## Zone filtering
 *
 * The project is loaded via [ProjectRepository] using the principal's
 * accessible zones, so a project in an inaccessible zone yields 404 rather
 * than 403 (preventing zone enumeration).
 *
 * ## Multiple activities of the same type
 *
 * Multiple activities of the same [activityTypeCode] on one project are
 * intentional (decision YYY): "Phase 1 LA" and "Phase 2 LA" are distinct
 * activities with separate record sets.
 */
@Service
@Transactional(readOnly = true)
class ActivityService(
    private val projectRepository: ProjectRepository,
    private val assignmentRepository: ProjectAssignmentRepository,
    private val activityRepository: ProjectActivityRepository,
    private val recordRepository: ActivityRecordRepository,
    private val formDefinitionRepository: FormDefinitionRepository,
    private val auditLogWriter: AuditLogWriter,
) {
    // ── Read ──────────────────────────────────────────────────────────────────

    /**
     * Returns all non-deleted activities on [projectId] visible to [principal].
     *
     * Throws 404 if the project is not accessible (zone mismatch or deleted).
     */
    fun listForProject(
        projectId: UUID,
        principal: PiaPrincipal,
    ): List<ProjectActivity> {
        requireProjectAccess(projectId, principal)
        return activityRepository.findAllByProjectIdAndIsDeletedFalseOrderByCreatedAtAsc(projectId)
    }

    /**
     * Returns a single activity.  Throws 404 if the activity or its project
     * is not accessible.
     */
    fun getForPrincipal(
        activityId: UUID,
        principal: PiaPrincipal,
    ): ProjectActivity {
        val activity =
            activityRepository.findByIdAndIsDeletedFalse(activityId)
                ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        requireProjectAccess(activity.projectId, principal)
        return activity
    }

    /**
     * Returns all non-deleted records for [activityId].
     */
    fun listRecordsForActivity(
        activityId: UUID,
        principal: PiaPrincipal,
    ): List<ActivityRecord> {
        val activity = getForPrincipal(activityId, principal)
        return recordRepository.findAllByProjectActivityIdAndIsDeletedFalseOrderByCreatedAtAsc(activity.id)
    }

    /**
     * Returns a single activity record.
     */
    fun getRecordForPrincipal(
        recordId: UUID,
        principal: PiaPrincipal,
    ): ActivityRecord {
        val record =
            recordRepository.findByIdAndIsDeletedFalse(recordId)
                ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        // Access check via the parent activity → parent project
        getForPrincipal(record.projectActivityId, principal)
        return record
    }

    // ── Write ─────────────────────────────────────────────────────────────────

    /**
     * Creates a new [ProjectActivity] on the given project.
     *
     * The caller must be an active DY_CE_C or NODAL_DY_CE_C assignee on
     * [projectId].  Returns 403 if the assignment check fails.
     *
     * [defaultFormDefinitionId] is set to the latest active form definition
     * for the given [activityTypeCode], or left null if none exists yet.
     */
    @Transactional
    fun create(
        projectId: UUID,
        request: CreateActivityRequest,
        principal: PiaPrincipal,
    ): ActivityDetailResponse {
        requireProjectAccess(projectId, principal)
        requireDyceAssignment(projectId, principal)

        // Look up the latest active form definition for this activity type.
        // Null is acceptable — form definitions are seeded per-phase.
        val formDef =
            formDefinitionRepository.findLatestActiveByActivityTypeCode(request.activityTypeCode)

        val activity =
            ProjectActivity(
                projectId = projectId,
                activityTypeCode = request.activityTypeCode,
                name = request.name,
                scopeNotes = request.scopeNotes,
                targetCompletionDate = request.targetCompletionDate,
                primaryDyceUserId = principal.userId,
                defaultFormDefinitionId = formDef?.id,
                createdByUserId = principal.userId,
                updatedByUserId = principal.userId,
            )
        activityRepository.save(activity)

        auditLogWriter.write(
            actorUserId = principal.userId,
            action = "ACTIVITY.CREATE",
            entityType = "ACTIVITY",
            entityId = activity.id,
        )

        return activity.toDetailResponse()
    }

    /**
     * Creates an empty [ActivityRecord] for an existing [ProjectActivity].
     *
     * The caller must be able to access the parent project.  In Phase 1.8 the
     * record starts with empty `data_json`; full RJSF data entry is Phase 1.9.
     *
     * Requires a non-null [defaultFormDefinitionId] on the activity; throws
     * 422 (Unprocessable Entity) if the activity has no form definition yet.
     */
    @Transactional
    fun createRecord(
        activityId: UUID,
        request: CreateActivityRecordRequest,
        principal: PiaPrincipal,
    ): ActivityRecordDetailResponse {
        val activity = getForPrincipal(activityId, principal)
        requireDyceAssignment(activity.projectId, principal)

        val formDefId =
            activity.defaultFormDefinitionId
                ?: throw ResponseStatusException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "Activity has no form definition; cannot create a record yet",
                )

        val formDef =
            formDefinitionRepository.findById(formDefId).orElseThrow {
                ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Form definition not found")
            }

        val record =
            ActivityRecord(
                projectActivityId = activity.id,
                formDefinitionId = formDef.id,
                workflowDefinitionId = activity.defaultWorkflowDefinitionId,
                dataJson = JsonNodeFactory.instance.objectNode(),
                schemaVersionAtSave = formDef.version,
                recordSubtype = request.recordSubtype,
                createdByUserId = principal.userId,
                updatedByUserId = principal.userId,
            )
        recordRepository.save(record)

        auditLogWriter.write(
            actorUserId = principal.userId,
            action = "ACTIVITY_RECORD.CREATE",
            entityType = "ACTIVITY_RECORD",
            entityId = record.id,
        )

        return record.toDetailResponse()
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Verifies [principal] can access the project (zone filter).
     * Throws 404 if not found or inaccessible zone.
     */
    private fun requireProjectAccess(
        projectId: UUID,
        principal: PiaPrincipal,
    ) {
        if (principal.isSuperAdmin || principal.permissions.contains("PROJECT.READ.ALL")) {
            projectRepository.findByIdAndIsDeletedFalse(projectId)
                ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
            return
        }
        val zones = principal.accessibleZoneIds
        if (zones.isEmpty()) throw ResponseStatusException(HttpStatus.NOT_FOUND)
        projectRepository.findByIdInZones(projectId, zones)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
    }

    /**
     * Verifies [principal] is an active DY_CE_C or NODAL_DY_CE_C on [projectId].
     *
     * Returns 403 (not 404) when the assignment is absent — the project's
     * existence is already confirmed by [requireProjectAccess].
     */
    private fun requireDyceAssignment(
        projectId: UUID,
        principal: PiaPrincipal,
    ) {
        if (principal.isSuperAdmin) return

        val assignedRoles =
            assignmentRepository
                .findAllByProjectIdAndIsActiveTrue(projectId)
                .filter { it.userId == principal.userId }
                .map { it.assignmentRole }
                .toSet()

        val isAssigned = assignedRoles.any { it == "DY_CE_C" || it == "NODAL_DY_CE_C" }
        if (!isAssigned) {
            throw ResponseStatusException(
                HttpStatus.FORBIDDEN,
                "User is not assigned as DY_CE_C or NODAL_DY_CE_C on this project",
            )
        }
    }

    private fun ProjectActivity.toDetailResponse(): ActivityDetailResponse =
        ActivityDetailResponse(
            id = id,
            projectId = projectId,
            activityTypeCode = activityTypeCode,
            name = name,
            scopeNotes = scopeNotes,
            targetCompletionDate = targetCompletionDate,
            primaryDyceUserId = primaryDyceUserId,
            status = status,
            defaultFormDefinitionId = defaultFormDefinitionId,
            createdByUserId = createdByUserId,
            createdAt = createdAt,
            updatedAt = updatedAt,
            version = version,
        )

    private fun ActivityRecord.toDetailResponse(): ActivityRecordDetailResponse =
        ActivityRecordDetailResponse(
            id = id,
            projectActivityId = projectActivityId,
            formDefinitionId = formDefinitionId,
            schemaVersionAtSave = schemaVersionAtSave,
            recordState = recordState,
            recordSubtype = recordSubtype,
            createdByUserId = createdByUserId,
            createdAt = createdAt,
            updatedAt = updatedAt,
            version = version,
        )
}
