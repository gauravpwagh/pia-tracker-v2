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
import `in`.gov.ir.pia.service.comment.CommentService
import `in`.gov.ir.pia.service.comment.CreateCommentRequest
import `in`.gov.ir.pia.workflow.WorkflowService
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.JsonNodeFactory
import jakarta.persistence.EntityManager
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
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

data class PatchActivityRecordRequest(
    /** Full replacement of the record's data_json. No partial-merge; send the complete current form state. */
    val dataJson: JsonNode,
)

/**
 * Body for all workflow action endpoints (submit, verify, authenticate, send-back,
 * resubmit, re-verify).
 *
 * [sectionCode] identifies which section instance to act on.  Null for record-level
 * (non-section) workflow forms.
 *
 * [comment] is required when the transition demands one (e.g. send-back); the
 * underlying [WorkflowService.transition] enforces this and throws
 * [MissingCommentException] if absent.
 */
data class WorkflowActionRequest(
    val sectionCode: String? = null,
    val comment: String? = null,
)

/** Summary of a single workflow instance returned by the workflow-state endpoint. */
data class SectionWorkflowStateResponse(
    val instanceId: java.util.UUID,
    val sectionCode: String?,
    val currentStateCode: String,
    val currentStateLabel: String,
    val isTerminal: Boolean,
    val isSlaBreached: Boolean,
    val enteredStateAt: java.time.Instant,
    /** Action codes the calling principal may perform right now. */
    val availableActions: List<String>,
)

/** Workflow state for all sections (or the single record-level instance) of a record. */
data class RecordWorkflowStateResponse(
    val recordId: java.util.UUID,
    val instances: List<SectionWorkflowStateResponse>,
)

/** One entry in the record history timeline (a workflow state transition). */
data class RecordHistoryEntry(
    val historyId: java.util.UUID,
    val instanceId: java.util.UUID,
    val sectionCode: String?,
    val fromStateCode: String?,
    val fromStateLabel: String?,
    val toStateCode: String,
    val toStateLabel: String,
    val actionCode: String?,
    val actorUserId: java.util.UUID,
    val actorName: String,
    val comment: String?,
    val occurredAt: java.time.Instant,
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
    /** Full form data. Empty object `{}` at creation; updated on each autosave PATCH. */
    val dataJson: JsonNode,
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
    private val jdbc: JdbcTemplate,
    private val objectMapper: ObjectMapper,
    private val entityManager: EntityManager,
    private val workflowService: WorkflowService,
    private val commentService: CommentService,
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

        // ── Start per-section (or per-record) workflow instances ──────────────
        //
        // For section-level-workflow forms (e.g. Land Acquisition with 9
        // section_codes): start one SECTION_STANDARD_V1 instance per section.
        //
        // For record-level forms (empty section_codes): start one
        // RECORD_STANDARD_V1 instance for the whole record.
        //
        // The section code is stored on the workflow_instance row so that
        // WorkflowService.currentState(entityType, entityId, sectionCode) can
        // look up per-section state.
        val sectionCodes = formDef.sectionCodes
        if (sectionCodes.isNotEmpty()) {
            sectionCodes.forEach { sectionCode ->
                workflowService.start(
                    definitionCode = "SECTION_STANDARD_V1",
                    entityType = "ACTIVITY_RECORD",
                    entityId = record.id,
                    sectionCode = sectionCode,
                )
            }
        } else {
            workflowService.start(
                definitionCode = "RECORD_STANDARD_V1",
                entityType = "ACTIVITY_RECORD",
                entityId = record.id,
                sectionCode = null,
            )
        }

        auditLogWriter.write(
            actorUserId = principal.userId,
            action = "ACTIVITY_RECORD.CREATE",
            entityType = "ACTIVITY_RECORD",
            entityId = record.id,
        )

        return record.toDetailResponse()
    }

    /**
     * Autosave PATCH: replaces the record's [dataJson] with [request.dataJson].
     *
     * ## Optimistic locking
     *
     * [expectedVersion] must match `activity_records.version`; if it doesn't
     * (concurrent edit or stale client), 409 Conflict is returned.  The client
     * must reload the record and retry.
     *
     * ## No schema validation on autosave
     *
     * Partial form data is valid during editing.  Schema validation is enforced
     * only when the user submits the record (workflow "submit" action, Phase 1.11).
     * Autosave stores whatever the client sends without rejecting incomplete data.
     *
     * ## JdbcTemplate instead of JPA
     *
     * [ActivityRecord] has all-`val` fields; Hibernate cannot update it in place.
     * A direct SQL UPDATE is the cleanest solution, with the `version` increment
     * handled by the DB expression `version = version + 1`.
     */
    @Transactional
    fun patchRecord(
        recordId: UUID,
        request: PatchActivityRecordRequest,
        expectedVersion: Int,
        principal: PiaPrincipal,
    ): ActivityRecordDetailResponse {
        // Load to verify existence and access (zone + dyce assignment)
        val existing =
            recordRepository.findByIdAndIsDeletedFalse(recordId)
                ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        val activity = getForPrincipal(existing.projectActivityId, principal)
        requireDyceAssignment(activity.projectId, principal)

        val dataJsonString = objectMapper.writeValueAsString(request.dataJson)

        // UPDATE with version guard — 0 rows updated means optimistic lock conflict
        val rowsUpdated =
            jdbc.update(
                """
                UPDATE activity_records
                   SET data_json           = ?::jsonb,
                       schema_version_at_save = ?,
                       updated_by_user_id  = ?,
                       updated_at          = now(),
                       version             = version + 1
                 WHERE id = ? AND version = ? AND is_deleted = false
                """.trimIndent(),
                dataJsonString,
                existing.schemaVersionAtSave,  // keep the version-at-save from creation; Phase 1.10 may bump it
                principal.userId,
                recordId,
                expectedVersion,
            )

        if (rowsUpdated == 0) {
            throw ResponseStatusException(
                HttpStatus.CONFLICT,
                "Record was modified concurrently; reload to continue",
            )
        }

        // Evict the L1 cache so the next findBy goes to the DB and reads the
        // version that the JdbcTemplate UPDATE just wrote (version + 1).
        // Without this, Hibernate returns the stale cached entity (version = 0).
        entityManager.clear()

        // Reload to get the new version number and all updated fields
        val updated =
            recordRepository.findByIdAndIsDeletedFalse(recordId)
                ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)

        return updated.toDetailResponse()
    }

    // ── Workflow state + actions ───────────────────────────────────────────────

    /**
     * Returns the current workflow state for every section (or the single
     * record-level instance) of [recordId], together with the action codes that
     * [principal] may perform in each.
     *
     * Access check: the caller must be able to reach the parent project (zone
     * filter).  No DyCE-assignment check — CE/C and Nodal also need to read
     * workflow state for Verify/Authenticate.
     */
    @Transactional(readOnly = true)
    fun getWorkflowState(
        recordId: UUID,
        principal: PiaPrincipal,
    ): RecordWorkflowStateResponse {
        val record =
            recordRepository.findByIdAndIsDeletedFalse(recordId)
                ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        getForPrincipal(record.projectActivityId, principal)  // zone access check

        val instances = workflowService.getInstances("ACTIVITY_RECORD", recordId)
        return RecordWorkflowStateResponse(
            recordId = recordId,
            instances = instances.map { it.toSectionResponse(principal) },
        )
    }

    /**
     * Performs a workflow [actionCode] (submit, verify, authenticate, send_back,
     * resubmit, re_verify) on the section identified by [request.sectionCode],
     * or on the record-level instance when [request.sectionCode] is null.
     *
     * Access check: caller must be able to reach the parent project.
     * Role check and comment enforcement are delegated to [WorkflowService.transition].
     */
    @Transactional
    fun performWorkflowAction(
        recordId: UUID,
        actionCode: String,
        request: WorkflowActionRequest,
        principal: PiaPrincipal,
    ): SectionWorkflowStateResponse {
        val record =
            recordRepository.findByIdAndIsDeletedFalse(recordId)
                ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        getForPrincipal(record.projectActivityId, principal)  // zone access check

        val instance =
            workflowService.getInstance("ACTIVITY_RECORD", recordId, request.sectionCode)
                ?: throw ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    if (request.sectionCode != null)
                        "No workflow instance found for section '${request.sectionCode}'"
                    else
                        "No workflow instance found for this record",
                )

        // Capture the current state code before the transition (for the comment snapshot)
        val stateBeforeAction = instance.currentState.code

        val updated = workflowService.transition(instance.id, actionCode, principal, request.comment)

        // Auto-mirror the workflow comment into the Comments panel so it appears on the
        // timeline alongside freeform user notes.
        if (!request.comment.isNullOrBlank()) {
            commentService.create(
                CreateCommentRequest(
                    entityType = "ACTIVITY_RECORD",
                    entityId = recordId,
                    bodyMarkdown = request.comment,
                ),
                principal,
                workflowStateAtComment = stateBeforeAction,
            )
        }

        return updated.toSectionResponse(principal)
    }

    // ── History ───────────────────────────────────────────────────────────────

    /**
     * Returns all workflow transition history entries for a record, across all section
     * instances, ordered by `at` ascending (oldest first).
     */
    @Transactional(readOnly = true)
    fun getHistory(recordId: UUID, principal: PiaPrincipal): List<RecordHistoryEntry> {
        val record = recordRepository.findByIdAndIsDeletedFalse(recordId)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        getForPrincipal(record.projectActivityId, principal)  // zone access check

        return jdbc.query(
            """
            SELECT
                wh.id               AS history_id,
                wi.id               AS instance_id,
                wi.section_code,
                fs.code             AS from_state_code,
                fs.label            AS from_state_label,
                ts.code             AS to_state_code,
                ts.label            AS to_state_label,
                wt.action_code,
                u.id                AS actor_user_id,
                u.name              AS actor_name,
                wh.comment,
                wh.at               AS occurred_at
            FROM workflow_history wh
            JOIN workflow_instances wi ON wi.id = wh.workflow_instance_id
            JOIN workflow_states ts    ON ts.id = wh.to_state_id
            LEFT JOIN workflow_states fs    ON fs.id = wh.from_state_id
            LEFT JOIN workflow_transitions wt ON wt.id = wh.transition_id
            JOIN users u                ON u.id = wh.actor_user_id
            WHERE wi.entity_type = 'ACTIVITY_RECORD'
              AND wi.entity_id = ?
            ORDER BY wh.at ASC
            """.trimIndent(),
            { rs, _ ->
                RecordHistoryEntry(
                    historyId = UUID.fromString(rs.getString("history_id")),
                    instanceId = UUID.fromString(rs.getString("instance_id")),
                    sectionCode = rs.getString("section_code"),
                    fromStateCode = rs.getString("from_state_code"),
                    fromStateLabel = rs.getString("from_state_label"),
                    toStateCode = rs.getString("to_state_code"),
                    toStateLabel = rs.getString("to_state_label"),
                    actionCode = rs.getString("action_code"),
                    actorUserId = UUID.fromString(rs.getString("actor_user_id")),
                    actorName = rs.getString("actor_name"),
                    comment = rs.getString("comment"),
                    occurredAt = rs.getTimestamp("occurred_at").toInstant(),
                )
            },
            recordId,
        )
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
            dataJson = dataJson,
            recordState = recordState,
            recordSubtype = recordSubtype,
            createdByUserId = createdByUserId,
            createdAt = createdAt,
            updatedAt = updatedAt,
            version = version,
        )

    private fun `in`.gov.ir.pia.domain.workflow.WorkflowInstance.toSectionResponse(
        principal: PiaPrincipal,
    ): SectionWorkflowStateResponse =
        SectionWorkflowStateResponse(
            instanceId = id,
            sectionCode = sectionCode,
            currentStateCode = currentState.code,
            currentStateLabel = currentState.label,
            isTerminal = currentState.isTerminal,
            isSlaBreached = workflowService.isSlaBreached(id),
            enteredStateAt = enteredStateAt,
            availableActions = workflowService.availableActions(this, principal),
        )
}
