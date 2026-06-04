package `in`.gov.ir.pia.service.activity

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.JsonNodeFactory
import `in`.gov.ir.pia.audit.AuditLogWriter
import `in`.gov.ir.pia.domain.activity.ActivityRecord
import `in`.gov.ir.pia.domain.activity.ProjectActivity
import `in`.gov.ir.pia.repository.ActivityRecordRepository
import `in`.gov.ir.pia.repository.FormDefinitionRepository
import `in`.gov.ir.pia.repository.ProjectActivityRepository
import `in`.gov.ir.pia.repository.ProjectAssignmentRepository
import `in`.gov.ir.pia.repository.ProjectRepository
import `in`.gov.ir.pia.repository.WorkflowInstanceRepository
import `in`.gov.ir.pia.security.PiaPrincipal
import `in`.gov.ir.pia.service.comment.CommentService
import `in`.gov.ir.pia.service.comment.CreateCommentRequest
import `in`.gov.ir.pia.dashboard.ActivityRecordCreatedEvent
import `in`.gov.ir.pia.workflow.DrawingService
import `in`.gov.ir.pia.workflow.WorkflowService
import org.springframework.context.ApplicationEventPublisher
import jakarta.persistence.EntityManager
import org.slf4j.LoggerFactory
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
    /** Type-specific metadata (district, utility type, drawing type, etc.). */
    val metadataJson: JsonNode? = null,
)

data class UpdateActivityRequest(
    val name: String,
    val scopeNotes: String? = null,
    val targetCompletionDate: LocalDate? = null,
    /** Type-specific metadata (district, utility type, drawing type, etc.). */
    val metadataJson: JsonNode? = null,
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

data class ActivityWorkflowActionResult(
    /** Total records in the activity (deleted records excluded). */
    val totalRecords: Int,
    /** Workflow instances successfully transitioned. */
    val succeeded: Int,
    /** Instances that threw an exception during transition. */
    val failed: Int,
    /** Instances skipped (terminal state, already in target state, or role mismatch). */
    val skipped: Int,
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
    /** Type-specific metadata; always a JSON object (never null — defaults to {}). */
    val metadataJson: JsonNode,
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
    private val instanceRepository: WorkflowInstanceRepository,
    private val commentService: CommentService,
    private val drawingService: DrawingService,
    private val eventPublisher: ApplicationEventPublisher,
) {
    private val log = LoggerFactory.getLogger(ActivityService::class.java)

    // ── Read ──────────────────────────────────────────────────────────────────

    /**
     * Returns all non-deleted activities on [projectId] visible to [principal].
     *
     * Throws 404 if the project is not accessible (zone mismatch or deleted).
     */
    /**
     * Returns activities on [projectId] visible to [principal].
     *
     * Filter rules:
     * - ACTIVITY.READ.ALL (EDGS/CI, SUPER_ADMIN, ADMIN) → all activities.
     * - ACTIVITY.READ.ZONE (CAO/C)                      → all activities.
     * - ACTIVITY.READ.OWN + CE_C designation             → all activities
     *   (CE/C oversees the whole project).
     * - ACTIVITY.READ.OWN + NODAL_DY_CE_C designation   → all activities
     *   (Nodal verifies records across all activities).
     * - ACTIVITY.READ.OWN + DY_CE_C designation          → only activities
     *   where primary_dyce_user_id = principal.userId.
     */
    fun listForProject(
        projectId: UUID,
        principal: PiaPrincipal,
    ): List<ProjectActivity> {
        requireProjectAccess(projectId, principal)

        val allActivities = principal.isSuperAdmin ||
            principal.permissions.contains("ACTIVITY.READ.ALL") ||
            principal.permissions.contains("ACTIVITY.READ.ZONE") ||
            principal.designationCode == "CE_C" ||
            principal.designationCode == "NODAL_DY_CE_C"

        return if (allActivities) {
            activityRepository.findAllByProjectIdAndIsDeletedFalseOrderByCreatedAtAsc(projectId)
        } else {
            // DY_CE_C: only activities they are personally assigned to
            activityRepository
                .findAllByProjectIdAndPrimaryDyceUserIdAndIsDeletedFalseOrderByCreatedAtAsc(
                    projectId,
                    principal.userId,
                )
        }
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
     *
     * Pass a non-null [subtype] to filter by [ActivityRecord.recordSubtype]
     * (e.g. utility type for Utility Shifting records).
     */
    fun listRecordsForActivity(
        activityId: UUID,
        principal: PiaPrincipal,
        subtype: String? = null,
    ): List<ActivityRecord> {
        val activity = getForPrincipal(activityId, principal)
        return if (subtype != null) {
            recordRepository.findAllByProjectActivityIdAndRecordSubtypeAndIsDeletedFalseOrderByCreatedAtAsc(
                activity.id,
                subtype,
            )
        } else {
            recordRepository.findAllByProjectActivityIdAndIsDeletedFalseOrderByCreatedAtAsc(activity.id)
        }
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
        // Flush JPA writes to the DB before the JDBC detail-table INSERT so the
        // FK constraint (activity_id → project_activities.id) is satisfied.
        entityManager.flush()

        // Write type-specific fields to the dedicated detail table.
        upsertDetails(activity.id, request.activityTypeCode, request.metadataJson)

        // Start the activity-level workflow instance (ACTIVITY_STANDARD_V1).
        // This lets DY_CE_C submit, Nodal verify, and CE/C authenticate the
        // activity as a whole — independent of whether the activity has records.
        workflowService.start(
            definitionCode = "ACTIVITY_STANDARD_V1",
            entityType     = "PROJECT_ACTIVITY",
            entityId       = activity.id,
        )

        // For Drawing Approval: auto-create the single activity record so the user
        // never has to manually "create a record" for a drawing.
        // The drawing_type from metadataJson becomes the recordSubtype (e.g. "ESP", "GAD_MINOR").
        // If drawing_type is absent, the record is not created now — it can be created later
        // once the user edits the activity to set the type.
        if (request.activityTypeCode == "DRAWING_APPROVAL") {
            val drawingType = request.metadataJson?.get("drawing_type")?.asText()
            if (!drawingType.isNullOrBlank()) {
                autoCreateDrawingRecord(activity.id, drawingType, principal)
            }
        }

        auditLogWriter.write(
            actorUserId = principal.userId,
            action = "ACTIVITY.CREATE",
            entityType = "ACTIVITY",
            entityId = activity.id,
        )

        // For activity types that have no records (data lives on the activity
        // itself), seed the project_activity_summary row so the dashboard shows
        // the activity from the moment it is created.
        if (request.activityTypeCode == "TENDER_PACKAGING") {
            eventPublisher.publishEvent(
                ActivityRecordCreatedEvent(
                    projectId        = projectId,
                    activityTypeCode = request.activityTypeCode,
                    recordSubtype    = null,
                ),
            )
        }

        return activity.toDetailResponse(readDetails(activity.id, request.activityTypeCode))
    }

    /**
     * Auto-creates a single [ActivityRecord] for a Drawing Approval activity.
     *
     * Called inside the same transaction as [create].  The form definition is
     * looked up by `{drawingType}_DRAWING_V1`; if none exists the call is a
     * no-op so that unknown / future drawing types don't break activity creation.
     */
    private fun autoCreateDrawingRecord(
        activityId: UUID,
        drawingType: String,
        principal: PiaPrincipal,
    ) {
        val formCode = "${drawingType}_DRAWING_V1"
        val formDef = formDefinitionRepository.findLatestActiveByCode(formCode) ?: return

        val activity = activityRepository.findByIdAndIsDeletedFalse(activityId) ?: return
        val project  = projectRepository.findByIdAndIsDeletedFalse(activity.projectId)

        val record = ActivityRecord(
            projectActivityId = activityId,
            formDefinitionId  = formDef.id,
            workflowDefinitionId = null, // drawings use the checklist model, not the workflow engine
            dataJson          = JsonNodeFactory.instance.objectNode(),
            schemaVersionAtSave = formDef.version,
            recordSubtype     = drawingType,
            createdByUserId   = principal.userId,
            updatedByUserId   = principal.userId,
        )
        recordRepository.save(record)

        // Seed default approvers from the form definition's default_approver_designations.
        drawingService.seedDefaultApprovers(record.id, formDef, project?.zoneId)

        auditLogWriter.write(
            actorUserId = principal.userId,
            action      = "ACTIVITY_RECORD.CREATE",
            entityType  = "ACTIVITY_RECORD",
            entityId    = record.id,
        )
    }

    /**
     * Updates mutable metadata on an existing [ProjectActivity].
     *
     * Updatable fields: [name], [scopeNotes], [targetCompletionDate].
     * Immutable: [activityTypeCode], [projectId], [status], [primaryDyceUserId].
     *
     * Uses [JdbcTemplate] because the entity has all-`val` fields; Hibernate
     * cannot update it in place.  The version increment is done atomically in SQL.
     *
     * Access control: caller must be able to read the parent project (zone filter)
     * and be an active DY_CE_C or NODAL_DY_CE_C on that project.
     */
    @Transactional
    fun update(
        activityId: UUID,
        request: UpdateActivityRequest,
        principal: PiaPrincipal,
    ): ActivityDetailResponse {
        val activity = getForPrincipal(activityId, principal)
        requireDyceAssignment(activity.projectId, principal)

        // Block edits once the activity has been authenticated.
        val wfState = workflowService.currentState("PROJECT_ACTIVITY", activityId)
        if (wfState?.isTerminal == true) {
            throw ResponseStatusException(
                HttpStatus.CONFLICT,
                "This activity has been authenticated and can no longer be edited.",
            )
        }

        jdbc.update(
            """
            UPDATE project_activities
               SET name                   = ?,
                   scope_notes            = ?,
                   target_completion_date = ?,
                   updated_by_user_id     = ?,
                   updated_at             = now(),
                   version                = version + 1
             WHERE id = ? AND is_deleted = false
            """.trimIndent(),
            request.name,
            request.scopeNotes,
            request.targetCompletionDate,
            principal.userId,
            activityId,
        )

        // Write type-specific fields to the dedicated detail table.
        upsertDetails(activityId, activity.activityTypeCode, request.metadataJson)

        entityManager.clear()

        val updated =
            activityRepository.findByIdAndIsDeletedFalse(activityId)
                ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)

        auditLogWriter.write(
            actorUserId = principal.userId,
            action = "ACTIVITY.UPDATE",
            entityType = "ACTIVITY",
            entityId = activityId,
        )

        return updated.toDetailResponse(readDetails(activityId, activity.activityTypeCode))
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
        requireRecordWriteAccess(activity.projectId, principal)

        val wfState = workflowService.currentState("PROJECT_ACTIVITY", activityId)
        if (wfState?.isTerminal == true) {
            throw ResponseStatusException(
                HttpStatus.CONFLICT,
                "This activity has been authenticated. Records cannot be added.",
            )
        }

        // ── Resolve form definition ───────────────────────────────────────────
        //
        // Drawing activities (DRAWING_APPROVAL) have one form definition per
        // drawing type.  The caller supplies [request.recordSubtype] (e.g. "ESP",
        // "SIP", "TUNNEL_DESIGN") and we look up "{subtype}_DRAWING_V1".
        //
        // All other activity types use the activity's defaultFormDefinitionId,
        // which was set at activity-creation time from the latest active form for
        // the activity type.
        val formDef =
            if (activity.activityTypeCode == "DRAWING_APPROVAL") {
                val subtype =
                    request.recordSubtype
                        ?: throw ResponseStatusException(
                            HttpStatus.UNPROCESSABLE_ENTITY,
                            "Drawing records require recordSubtype (e.g. 'ESP', 'SIP', 'GAD_MINOR')",
                        )
                val formCode = "${subtype}_DRAWING_V1"
                formDefinitionRepository.findLatestActiveByCode(formCode)
                    ?: throw ResponseStatusException(
                        HttpStatus.UNPROCESSABLE_ENTITY,
                        "No active drawing form definition found for type '$subtype' (looked up code '$formCode')",
                    )
            } else {
                val formDefId =
                    activity.defaultFormDefinitionId
                        ?: throw ResponseStatusException(
                            HttpStatus.UNPROCESSABLE_ENTITY,
                            "Activity has no form definition; cannot create a record yet",
                        )
                formDefinitionRepository.findById(formDefId).orElseThrow {
                    ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Form definition not found")
                }
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
        // Drawing records use the checklist model (DrawingService) instead of
        // the workflow engine — no WorkflowInstance rows are created.
        //
        // For section-level-workflow forms (e.g. Land Acquisition, Forest
        // Clearance): start one SECTION_STANDARD_V1 instance per section code.
        //
        // For record-level forms (empty section_codes): start one
        // RECORD_STANDARD_V1 instance for the whole record.
        if (formDef.activityTypeCode == "DRAWING_APPROVAL") {
            // Drawing checklist: seed default approvers from form definition.
            // Resolve the project zone for matching approver users.
            val project = projectRepository.findByIdAndIsDeletedFalse(activity.projectId)
            drawingService.seedDefaultApprovers(record.id, formDef, project?.zoneId)
        } else {
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
        }

        auditLogWriter.write(
            actorUserId = principal.userId,
            action = "ACTIVITY_RECORD.CREATE",
            entityType = "ACTIVITY_RECORD",
            entityId = record.id,
        )

        // Seed the summary so the record is visible on the dashboard immediately,
        // before any workflow action is taken.
        eventPublisher.publishEvent(
            ActivityRecordCreatedEvent(
                projectId        = activity.projectId,
                activityTypeCode = activity.activityTypeCode,
                recordSubtype    = record.recordSubtype,
            ),
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
        // Load to verify existence and access (zone + write access check)
        val existing =
            recordRepository.findByIdAndIsDeletedFalse(recordId)
                ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        val activity = getForPrincipal(existing.projectActivityId, principal)
        requireRecordWriteAccess(activity.projectId, principal)

        val wfState = workflowService.currentState("PROJECT_ACTIVITY", activity.id)
        if (wfState?.isTerminal == true) {
            throw ResponseStatusException(
                HttpStatus.CONFLICT,
                "This activity has been authenticated and records can no longer be edited.",
            )
        }

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
                existing.schemaVersionAtSave, // keep the version-at-save from creation; Phase 1.10 may bump it
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

    /**
     * Soft-deletes an [ActivityRecord] (sets is_deleted = true).
     *
     * Allowed for:
     *   - DY_CE_C / NODAL_DY_CE_C assigned to the project (can delete records they created)
     *   - CE/C (zone-level authority — can delete any non-authenticated record)
     *   - Super admin
     *
     * Records in AUTHENTICATED state (is_terminal = true) cannot be deleted —
     * an authenticated entry is part of the official record.
     *
     * Returns 404 if the record does not exist or is already deleted.
     * Returns 409 if the record is AUTHENTICATED.
     * Returns 403 if the principal has no write access on the parent project.
     */
    @Transactional
    fun deleteRecord(
        recordId: UUID,
        principal: PiaPrincipal,
    ) {
        val record = recordRepository.findByIdAndIsDeletedFalse(recordId)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        val activity = getForPrincipal(record.projectActivityId, principal)
        requireRecordWriteAccess(activity.projectId, principal)

        // Block deletion once the activity is authenticated.
        val wfState = workflowService.currentState("PROJECT_ACTIVITY", activity.id)
        if (wfState?.isTerminal == true) {
            throw ResponseStatusException(
                HttpStatus.CONFLICT,
                "This activity has been authenticated. Records cannot be deleted.",
            )
        }

        jdbc.update(
            """
            UPDATE activity_records
               SET is_deleted = true,
                   updated_at = now()
             WHERE id = ? AND is_deleted = false
            """.trimIndent(),
            recordId,
        )

        auditLogWriter.write(
            actorUserId = principal.userId,
            action      = "ACTIVITY_RECORD.DELETE",
            entityType  = "ACTIVITY_RECORD",
            entityId    = recordId,
        )
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
        getForPrincipal(record.projectActivityId, principal) // zone access check

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
        getForPrincipal(record.projectActivityId, principal) // zone access check

        val instance =
            workflowService.getInstance("ACTIVITY_RECORD", recordId, request.sectionCode)
                ?: throw ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    if (request.sectionCode != null) {
                        "No workflow instance found for section '${request.sectionCode}'"
                    } else {
                        "No workflow instance found for this record"
                    },
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
    fun getHistory(
        recordId: UUID,
        principal: PiaPrincipal,
    ): List<RecordHistoryEntry> {
        val record =
            recordRepository.findByIdAndIsDeletedFalse(recordId)
                ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        getForPrincipal(record.projectActivityId, principal) // zone access check

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

    // ── Detail-table helpers ──────────────────────────────────────────────────

    /**
     * Reads type-specific fields for [activityId] from the dedicated detail table
     * and returns them as a [JsonNode] object.  Returns an empty object node if
     * no detail row exists yet or the type is unknown.
     *
     * Exposed publicly so [ActivityController.getActivity] can call it without
     * duplicating the type-dispatch logic.
     */
    fun readMetadata(activityId: UUID, typeCode: String): JsonNode =
        readDetails(activityId, typeCode)

    /** Dispatch to the correct dedicated table for reads. */
    private fun readDetails(activityId: UUID, typeCode: String): JsonNode {
        val (table, cols) = when (typeCode) {
            "LAND_ACQUISITION" ->
                "land_acquisition_details" to
                    listOf(
                        "district", "sub_division_taluka",
                        "area_hectares_total", "area_hectares_private", "area_hectares_govt", "area_hectares_forest",
                        "villages_estimated_count",
                    )
            "FOREST_CLEARANCE" ->
                "forest_clearance_details" to
                    listOf("forest_division_name", "forest_area_hectares", "project_chainage_from", "project_chainage_to")
            "UTILITY_SHIFTING" ->
                "utility_shifting_details" to
                    listOf(
                        "utility_type", "owner_agency", "executing_agency",
                        "chainage_from", "chainage_to",
                        "estimated_cost", "sanctioned_cost",
                        "work_start_date", "expected_completion_date", "actual_completion_date",
                        "current_status", "remarks",
                        // LT/HT/EHV
                        "voltage_level", "length_km", "no_of_poles",
                        // Pipeline
                        "diameter_mm", "pipeline_length_m", "fluid_type",
                        // S&T
                        "cable_type", "cable_length_km", "no_of_circuits",
                        // Quarter/Station
                        "no_of_units", "area_sqm",
                        // TSS/SS/OHE
                        "capacity_mva", "no_of_bays",
                        // Other
                        "utility_description",
                        // Agency-conditional
                        "contractor_name", "work_order_no", "work_order_date",
                    )
            "DRAWING_APPROVAL" ->
                "drawing_approval_details" to
                    listOf("drawing_type", "drawing_number")
            "TENDER_PACKAGING" ->
                "tender_packaging_details" to
                    listOf("package_name", "epc_document_prepared", "tender_finalized")
            "TEMPORARY_OFFICE_SPACE" ->
                "temporary_office_space_details" to
                    listOf("structure_type", "count", "location_name", "location_chainage")
            else -> return JsonNodeFactory.instance.objectNode()
        }

        val rows = jdbc.queryForList(
            "SELECT ${cols.joinToString()} FROM $table WHERE activity_id = ?",
            activityId,
        )
        if (rows.isEmpty()) return JsonNodeFactory.instance.objectNode()

        val node = JsonNodeFactory.instance.objectNode()
        val row = rows[0]
        cols.forEach { col ->
            when (val v = row[col]) {
                null -> {} // omit nulls — frontend treats missing keys as empty
                is Boolean -> node.put(col, v)           // preserve as JSON boolean
                is String -> if (v.isNotBlank()) node.put(col, v)
                is java.math.BigDecimal -> node.put(col, v)
                is Int -> node.put(col, v)
                is Long -> node.put(col, v)
                else -> if (v.toString().isNotBlank()) node.put(col, v.toString())
            }
        }
        return node
    }

    /** Upsert type-specific fields into the dedicated detail table. */
    private fun upsertDetails(activityId: UUID, typeCode: String, metadata: JsonNode?) {
        if (metadata == null) return

        fun str(key: String): String? =
            metadata.get(key)?.takeIf { !it.isNull && it.isTextual }?.asText()?.ifBlank { null }

        fun dec(key: String): java.math.BigDecimal? =
            metadata.get(key)?.takeIf { !it.isNull && it.isNumber }?.decimalValue()

        fun int(key: String): Int? =
            metadata.get(key)?.takeIf { !it.isNull && it.isNumber }?.intValue()

        fun dat(key: String): LocalDate? =
            str(key)?.let { runCatching { LocalDate.parse(it) }.getOrNull() }

        fun bool(key: String): Boolean =
            metadata.get(key)?.let {
                when {
                    it.isBoolean -> it.booleanValue()
                    it.isTextual -> it.asText().equals("true", ignoreCase = true)
                    else -> false
                }
            } ?: false

        when (typeCode) {
            "LAND_ACQUISITION" -> jdbc.update(
                """
                INSERT INTO land_acquisition_details
                    (activity_id, district, sub_division_taluka,
                     area_hectares_total, area_hectares_private, area_hectares_govt, area_hectares_forest,
                     villages_estimated_count)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (activity_id) DO UPDATE SET
                    district                 = EXCLUDED.district,
                    sub_division_taluka      = EXCLUDED.sub_division_taluka,
                    area_hectares_total      = EXCLUDED.area_hectares_total,
                    area_hectares_private    = EXCLUDED.area_hectares_private,
                    area_hectares_govt       = EXCLUDED.area_hectares_govt,
                    area_hectares_forest     = EXCLUDED.area_hectares_forest,
                    villages_estimated_count = EXCLUDED.villages_estimated_count
                """.trimIndent(),
                activityId,
                str("district"),
                str("sub_division_taluka"),
                dec("area_hectares_total"),
                dec("area_hectares_private"),
                dec("area_hectares_govt"),
                dec("area_hectares_forest"),
                int("villages_estimated_count"),
            )
            "FOREST_CLEARANCE" -> jdbc.update(
                """
                INSERT INTO forest_clearance_details
                    (activity_id, forest_division_name, forest_area_hectares, project_chainage_from, project_chainage_to)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT (activity_id) DO UPDATE SET
                    forest_division_name  = EXCLUDED.forest_division_name,
                    forest_area_hectares  = EXCLUDED.forest_area_hectares,
                    project_chainage_from = EXCLUDED.project_chainage_from,
                    project_chainage_to   = EXCLUDED.project_chainage_to
                """.trimIndent(),
                activityId,
                str("forest_division_name"),
                dec("forest_area_hectares"),
                str("project_chainage_from"),
                str("project_chainage_to"),
            )
            "UTILITY_SHIFTING" -> jdbc.update(
                """
                INSERT INTO utility_shifting_details (
                    activity_id, utility_type, owner_agency, executing_agency,
                    chainage_from, chainage_to,
                    estimated_cost, sanctioned_cost,
                    work_start_date, expected_completion_date, actual_completion_date,
                    current_status, remarks,
                    voltage_level, length_km, no_of_poles,
                    diameter_mm, pipeline_length_m, fluid_type,
                    cable_type, cable_length_km, no_of_circuits,
                    no_of_units, area_sqm,
                    capacity_mva, no_of_bays,
                    utility_description,
                    contractor_name, work_order_no, work_order_date
                ) VALUES (
                    ?, ?, ?, ?,
                    ?, ?,
                    ?, ?,
                    ?, ?, ?,
                    ?, ?,
                    ?, ?, ?,
                    ?, ?, ?,
                    ?, ?, ?,
                    ?, ?,
                    ?, ?,
                    ?,
                    ?, ?, ?
                )
                ON CONFLICT (activity_id) DO UPDATE SET
                    utility_type              = EXCLUDED.utility_type,
                    owner_agency              = EXCLUDED.owner_agency,
                    executing_agency          = EXCLUDED.executing_agency,
                    chainage_from             = EXCLUDED.chainage_from,
                    chainage_to               = EXCLUDED.chainage_to,
                    estimated_cost            = EXCLUDED.estimated_cost,
                    sanctioned_cost           = EXCLUDED.sanctioned_cost,
                    work_start_date           = EXCLUDED.work_start_date,
                    expected_completion_date  = EXCLUDED.expected_completion_date,
                    actual_completion_date    = EXCLUDED.actual_completion_date,
                    current_status            = EXCLUDED.current_status,
                    remarks                   = EXCLUDED.remarks,
                    voltage_level             = EXCLUDED.voltage_level,
                    length_km                 = EXCLUDED.length_km,
                    no_of_poles               = EXCLUDED.no_of_poles,
                    diameter_mm               = EXCLUDED.diameter_mm,
                    pipeline_length_m         = EXCLUDED.pipeline_length_m,
                    fluid_type                = EXCLUDED.fluid_type,
                    cable_type                = EXCLUDED.cable_type,
                    cable_length_km           = EXCLUDED.cable_length_km,
                    no_of_circuits            = EXCLUDED.no_of_circuits,
                    no_of_units               = EXCLUDED.no_of_units,
                    area_sqm                  = EXCLUDED.area_sqm,
                    capacity_mva              = EXCLUDED.capacity_mva,
                    no_of_bays                = EXCLUDED.no_of_bays,
                    utility_description       = EXCLUDED.utility_description,
                    contractor_name           = EXCLUDED.contractor_name,
                    work_order_no             = EXCLUDED.work_order_no,
                    work_order_date           = EXCLUDED.work_order_date
                """.trimIndent(),
                activityId,
                str("utility_type"), str("owner_agency"), str("executing_agency"),
                str("chainage_from"), str("chainage_to"),
                dec("estimated_cost"), dec("sanctioned_cost"),
                dat("work_start_date"), dat("expected_completion_date"), dat("actual_completion_date"),
                str("current_status"), str("remarks"),
                str("voltage_level"), dec("length_km"), int("no_of_poles"),
                int("diameter_mm"), dec("pipeline_length_m"), str("fluid_type"),
                str("cable_type"), dec("cable_length_km"), int("no_of_circuits"),
                int("no_of_units"), dec("area_sqm"),
                dec("capacity_mva"), int("no_of_bays"),
                str("utility_description"),
                str("contractor_name"), str("work_order_no"), dat("work_order_date"),
            )
            "DRAWING_APPROVAL" -> jdbc.update(
                """
                INSERT INTO drawing_approval_details
                    (activity_id, drawing_type, drawing_number)
                VALUES (?, ?, ?)
                ON CONFLICT (activity_id) DO UPDATE SET
                    drawing_type   = EXCLUDED.drawing_type,
                    drawing_number = EXCLUDED.drawing_number
                """.trimIndent(),
                activityId,
                str("drawing_type"),
                str("drawing_number"),
            )
            "TENDER_PACKAGING" -> jdbc.update(
                """
                INSERT INTO tender_packaging_details
                    (activity_id, package_name, epc_document_prepared, tender_finalized)
                VALUES (?, ?, ?, ?)
                ON CONFLICT (activity_id) DO UPDATE SET
                    package_name          = EXCLUDED.package_name,
                    epc_document_prepared = EXCLUDED.epc_document_prepared,
                    tender_finalized      = EXCLUDED.tender_finalized
                """.trimIndent(),
                activityId,
                str("package_name"),
                bool("epc_document_prepared"),
                bool("tender_finalized"),
            )
            "TEMPORARY_OFFICE_SPACE" -> jdbc.update(
                """
                INSERT INTO temporary_office_space_details
                    (activity_id, structure_type, count, location_name, location_chainage)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT (activity_id) DO UPDATE SET
                    structure_type    = EXCLUDED.structure_type,
                    count             = EXCLUDED.count,
                    location_name     = EXCLUDED.location_name,
                    location_chainage = EXCLUDED.location_chainage
                """.trimIndent(),
                activityId,
                str("structure_type"),
                int("count"),
                str("location_name"),
                str("location_chainage"),
            )
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Verifies [principal] can access the project, using the same scope rules
     * as [ProjectService.getForPrincipal]:
     *   ALL-scope  → any non-deleted project.
     *   ZONE-scope → project must be in an accessible zone.
     *   OWN-scope  → user must have an active assignment on the project.
     * Throws 404 (not 403) to avoid existence leaks.
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
        if (principal.permissions.contains("PROJECT.READ.ZONE")) {
            val zones = principal.accessibleZoneIds
            if (zones.isEmpty()) throw ResponseStatusException(HttpStatus.NOT_FOUND)
            projectRepository.findByIdInZones(projectId, zones)
                ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
            return
        }
        // OWN-scope: must have an active assignment on the project
        projectRepository.findByIdAndAssignedUser(projectId, principal.userId)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
    }

    // ── Activity-level workflow state & direct actions ────────────────────────

    /**
     * Returns the workflow state of the activity itself (entity_type = PROJECT_ACTIVITY).
     *
     * If no instance exists yet (activity was created before V028), returns a
     * synthetic DRAFT state so the UI can still show the Submit button.
     * The instance is lazily started on the first [performActivityDirectWorkflowAction] call.
     */
    @Transactional(readOnly = true)
    fun getActivityWorkflowState(
        activityId: UUID,
        principal: PiaPrincipal,
    ): SectionWorkflowStateResponse {
        val activity = getForPrincipal(activityId, principal)
        val instance = instanceRepository.findByEntityTypeAndEntityIdNoSection(
            "PROJECT_ACTIVITY", activity.id,
        )
        val syntheticDraft = SectionWorkflowStateResponse(
            instanceId       = UUID.fromString("00000000-0000-0000-0000-000000000000"),
            sectionCode      = null,
            currentStateCode = "DRAFT",
            currentStateLabel = "Draft",
            isTerminal       = false,
            isSlaBreached    = false,
            enteredStateAt   = activity.createdAt,
            availableActions = if (principal.roleCodes.contains("ROLE_DY_CE_C") || principal.isSuperAdmin)
                listOf("submit") else emptyList(),
        )
        if (instance == null) return syntheticDraft

        val available = workflowService.availableActions(instance, principal)
        return SectionWorkflowStateResponse(
            instanceId       = instance.id,
            sectionCode      = null,
            currentStateCode = instance.currentState.code,
            currentStateLabel = instance.currentState.label,
            isTerminal       = instance.currentState.isTerminal,
            isSlaBreached    = workflowService.isSlaBreached(instance.id),
            enteredStateAt   = instance.enteredStateAt,
            availableActions = available,
        )
    }

    /**
     * Applies a workflow action directly to the activity's own workflow instance
     * (entity_type = PROJECT_ACTIVITY).
     *
     * If no instance exists yet, it is lazily created in DRAFT state before
     * the transition.  This handles activities created before V028.
     */
    @Transactional
    fun performActivityDirectWorkflowAction(
        activityId: UUID,
        action: String,
        comment: String?,
        principal: PiaPrincipal,
    ): SectionWorkflowStateResponse {
        val activity = getForPrincipal(activityId, principal)

        var instance = instanceRepository.findByEntityTypeAndEntityIdNoSection(
            "PROJECT_ACTIVITY", activity.id,
        )
        // Lazy bootstrap for activities created before V028 migration.
        if (instance == null) {
            instance = workflowService.start(
                definitionCode = "ACTIVITY_STANDARD_V1",
                entityType     = "PROJECT_ACTIVITY",
                entityId       = activity.id,
            )
        }

        val updated = workflowService.transition(
            instanceId = instance.id,
            actionCode = action,
            actor      = principal,
            comment    = comment,
        )
        val available = workflowService.availableActions(updated, principal)
        return SectionWorkflowStateResponse(
            instanceId        = updated.id,
            sectionCode       = null,
            currentStateCode  = updated.currentState.code,
            currentStateLabel = updated.currentState.label,
            isTerminal        = updated.currentState.isTerminal,
            isSlaBreached     = false,
            enteredStateAt    = updated.enteredStateAt,
            availableActions  = available,
        )
    }

    // ── Activity-level workflow action (bulk on records) ──────────────────────

    /**
     * Applies a workflow [action] to every eligible record (and section instance)
     * in [activityId] in one call.
     *
     * For each record the service loads all workflow instances (both record-level
     * and section-level).  It then attempts to transition each instance where:
     *   1. The instance is not in a terminal state.
     *   2. The action is in the list returned by [WorkflowService.availableActions]
     *      for the calling [principal].
     *
     * Failures on individual instances are collected but do not roll back
     * successful transitions (best-effort semantics, same as bulk-transition).
     *
     * A [comment] is forwarded to every transition that requires one.
     */
    @Transactional
    fun performActivityWorkflowAction(
        activityId: UUID,
        action: String,
        comment: String?,
        principal: PiaPrincipal,
    ): ActivityWorkflowActionResult {
        val activity = activityRepository.findByIdAndIsDeletedFalse(activityId)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        requireProjectAccess(activity.projectId, principal)

        val records = recordRepository
            .findAllByProjectActivityIdAndIsDeletedFalseOrderByCreatedAtAsc(activityId)

        var succeeded = 0
        var failed = 0
        var skipped = 0

        for (record in records) {
            val instances = instanceRepository.findAllByEntityTypeAndEntityId(
                "ACTIVITY_RECORD",
                record.id,
            )
            if (instances.isEmpty()) { skipped++; continue }

            for (instance in instances) {
                if (instance.currentState.isTerminal) { skipped++; continue }

                val available = workflowService.availableActions(instance, principal)
                if (action !in available) { skipped++; continue }

                try {
                    workflowService.transition(
                        instanceId = instance.id,
                        actionCode = action,
                        actor      = principal,
                        comment    = comment,
                    )
                    succeeded++
                } catch (ex: Exception) {
                    log.debug(
                        "Activity workflow action '{}' failed for instance {}: {}",
                        action, instance.id, ex.message,
                    )
                    failed++
                }
            }
        }

        return ActivityWorkflowActionResult(
            totalRecords = records.size,
            succeeded    = succeeded,
            failed       = failed,
            skipped      = skipped,
        )
    }

    /**
     * Verifies [principal] has write access to records on [projectId].
     *
     * Allowed principals:
     *   - Super admin (always)
     *   - CE/C (`designation_code = CE_C`) — zone-level managerial authority;
     *     CE/C may add, modify, and delete records before authentication.
     *   - DY_CE_C or NODAL_DY_CE_C actively assigned to the project.
     *
     * Returns 403 (not 404) when none of the above conditions are met.
     */
    private fun requireRecordWriteAccess(
        projectId: UUID,
        principal: PiaPrincipal,
    ) {
        if (principal.isSuperAdmin) return
        // CE/C has zone-level management authority — no per-project assignment needed.
        if (principal.designationCode == "CE_C") return

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
                "User is not assigned as DY_CE_C, NODAL_DY_CE_C, or CE/C on this project",
            )
        }
    }

    /** Backward-compat alias used by activity-level create/update which still requires Dy CE assignment. */
    private fun requireDyceAssignment(projectId: UUID, principal: PiaPrincipal) {
        if (principal.isSuperAdmin) return
        if (principal.designationCode == "CE_C") return   // CE/C can also manage activities
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

    /**
     * Maps [ProjectActivity] to [ActivityDetailResponse].
     *
     * [metaOverride] lets callers supply type-specific metadata read from the
     * dedicated detail table.  When null, falls back to the entity's [metadataJson]
     * JSONB column (kept for backwards compatibility with list endpoints).
     */
    private fun ProjectActivity.toDetailResponse(metaOverride: JsonNode? = null): ActivityDetailResponse =
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
            metadataJson = metaOverride ?: metadataJson,
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

    private fun `in`.gov.ir.pia.domain.workflow.WorkflowInstance.toSectionResponse(principal: PiaPrincipal): SectionWorkflowStateResponse =
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
