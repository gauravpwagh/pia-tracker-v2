package `in`.gov.ir.pia.workflow

import `in`.gov.ir.pia.audit.AuditLogWriter
import `in`.gov.ir.pia.domain.activity.ActivityRecord
import `in`.gov.ir.pia.domain.drawing.DrawingApprover
import `in`.gov.ir.pia.domain.form.FormDefinition
import `in`.gov.ir.pia.notification.NotificationService
import `in`.gov.ir.pia.repository.ActivityRecordRepository
import `in`.gov.ir.pia.repository.DrawingApproverRepository
import `in`.gov.ir.pia.repository.ProjectActivityRepository
import `in`.gov.ir.pia.repository.ProjectRepository
import `in`.gov.ir.pia.security.PiaPrincipal
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import java.time.Instant
import java.util.UUID

// ── DTOs ──────────────────────────────────────────────────────────────────────

data class DrawingApproverResponse(
    val id: UUID,
    val approvalDesignationCode: String,
    val userId: UUID?,
    val status: String,
    val position: Int,
    val actedAt: Instant?,
    val comment: String?,
)

data class DrawingApproverListResponse(
    val recordId: UUID,
    val derivedState: String,
    val approvers: List<DrawingApproverResponse>,
)

data class ApproveRequest(
    val comment: String? = null,
)

data class SendBackRequest(
    val comment: String,
)

data class ReapproveRequest(
    /** If true, all APPROVED rows are reset to PENDING (full re-review). */
    val requestReApproval: Boolean = false,
)

/**
 * Request to add a new approver slot to a drawing (Phase 2.7).
 *
 * [designationCode] must be an approval-role designation (`is_approval_role = true`).
 * [userId] is optional; null leaves the slot unassigned.
 * [position] is optional; null appends after the last existing slot.
 */
data class AddApproverRequest(
    val designationCode: String,
    val userId: UUID? = null,
    val position: Int? = null,
)

/**
 * Request to reassign an approver slot to a different user (Phase 2.7).
 *
 * The slot must not be in APPROVED status (decision BBBB).
 * Pass [userId] = null to clear the assignment.
 */
data class ReassignApproverRequest(
    val userId: UUID?,
)

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * Drawing checklist model — separate from the workflow engine (docs/workflow.md § 5).
 *
 * Drawings have NO [WorkflowInstance] rows. Their overall state is derived from
 * [DrawingApprover] rows and cached in [ActivityRecord.recordState].
 *
 * Key decisions:
 * - CCCC: send-back flips only the acting approver's row; other rows unchanged.
 * - BBBB: reapprove flips only SENT_BACK rows to PENDING; APPROVED rows stay
 *         (unless [ReapproveRequest.requestReApproval] is true).
 * - HHHH: default approvers are resolved at record-creation time; subsequent
 *         zone / user changes do not affect existing rows.
 */
@Service
@Transactional(readOnly = true)
class DrawingService(
    private val drawingApproverRepository: DrawingApproverRepository,
    private val recordRepository: ActivityRecordRepository,
    private val activityRepository: ProjectActivityRepository,
    private val projectRepository: ProjectRepository,
    private val jdbc: JdbcTemplate,
    private val auditLogWriter: AuditLogWriter,
    private val notificationService: NotificationService,
) {
    // ── Read ──────────────────────────────────────────────────────────────────

    /**
     * Returns all non-deleted approver rows for [recordId] together with
     * the derived drawing state.
     */
    fun listApprovers(
        recordId: UUID,
        principal: PiaPrincipal,
    ): DrawingApproverListResponse {
        val record = requireRecordAccess(recordId, principal)
        val rows =
            drawingApproverRepository
                .findAllByActivityRecordIdAndIsDeletedFalseOrderByPositionAsc(recordId)
        // If the Dy CE/C hasn't submitted yet, honour the cached DRAFT state —
        // the rows exist but the drawing hasn't entered the approval circuit.
        val derivedState =
            if (record.recordState == "DRAFT") "DRAFT" else deriveState(rows)
        return DrawingApproverListResponse(
            recordId = recordId,
            derivedState = derivedState,
            approvers = rows.map { it.toResponse() },
        )
    }

    // ── Write ─────────────────────────────────────────────────────────────────

    /**
     * Seeds the default approver checklist for a newly created drawing record.
     *
     * Called by [in.gov.ir.pia.service.activity.ActivityService.createRecord]
     * after the record row is persisted, within the same transaction.
     *
     * For each designation in [formDef.defaultApproverDesignations]:
     * - If exactly one active user with that designation in [projectZoneId] →
     *   inserts a row with [user_id] populated.
     * - Otherwise → inserts a row with [user_id] = null (admin/Nodal must fill).
     */
    @Transactional
    fun seedDefaultApprovers(
        recordId: UUID,
        formDef: FormDefinition,
        projectZoneId: UUID?,
    ) {
        formDef.defaultApproverDesignations.forEachIndexed { index, designationCode ->
            val matchingUsers: List<UUID> =
                if (projectZoneId != null) {
                    jdbc.queryForList(
                        """
                        SELECT id FROM users
                        WHERE designation_code = ?
                          AND primary_zone_id  = ?
                          AND is_active         = true
                          AND is_deleted        = false
                        """.trimIndent(),
                        UUID::class.java,
                        designationCode,
                        projectZoneId,
                    )
                } else {
                    emptyList()
                }

            val userId = if (matchingUsers.size == 1) matchingUsers.first() else null

            val approver =
                DrawingApprover(
                    activityRecordId = recordId,
                    approvalDesignationCode = designationCode,
                    userId = userId,
                    status = "PENDING",
                    position = index,
                )
            drawingApproverRepository.save(approver)
        }
    }

    /**
     * Transitions a drawing from DRAFT to IN_APPROVAL.
     *
     * The Dy CE/C calls this when the drawing is ready for review.
     * Throws 409 if the record is not in DRAFT state.
     */
    @Transactional
    fun submit(
        recordId: UUID,
        actor: PiaPrincipal,
    ) {
        val record = requireRecordAccess(recordId, actor)
        if (record.recordState != "DRAFT") {
            throw ResponseStatusException(
                HttpStatus.CONFLICT,
                "Drawing is not in DRAFT state (current: ${record.recordState}); cannot submit",
            )
        }
        updateRecordState(recordId, "IN_APPROVAL")
        auditLogWriter.write(
            actorUserId = actor.userId,
            action = "DRAWING.SUBMIT",
            entityType = "ACTIVITY_RECORD",
            entityId = recordId,
        )
    }

    /**
     * Approves one approver slot on a drawing.
     *
     * The actor must be the user assigned to [approverId].
     * The slot must be in PENDING status.
     * After approval the drawing state is recomputed and cached.
     */
    @Transactional
    fun approve(
        recordId: UUID,
        approverId: UUID,
        actor: PiaPrincipal,
        comment: String?,
    ) {
        requireRecordAccess(recordId, actor)
        val approver = requireApproverSlot(approverId, recordId)
        requireIsActingApprover(approver, actor)
        if (approver.status != "PENDING") {
            throw ResponseStatusException(
                HttpStatus.CONFLICT,
                "Approver slot is not PENDING (current: ${approver.status})",
            )
        }
        mutateApproverRow(approverId, "APPROVED", actor.userId, comment)
        deriveAndCacheState(recordId)
        auditLogWriter.write(
            actorUserId = actor.userId,
            action = "DRAWING.APPROVE",
            entityType = "DRAWING_APPROVER",
            entityId = approverId,
        )
    }

    /**
     * Sends a drawing back for revision on behalf of one approver.
     *
     * Decision CCCC: only this approver's row changes; other rows are untouched.
     * The slot must be in PENDING status.
     * A non-blank [comment] is required.
     */
    @Transactional
    fun sendBack(
        recordId: UUID,
        approverId: UUID,
        actor: PiaPrincipal,
        comment: String,
    ) {
        if (comment.isBlank()) {
            throw ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Comment is required for send-back")
        }
        requireRecordAccess(recordId, actor)
        val approver = requireApproverSlot(approverId, recordId)
        requireIsActingApprover(approver, actor)
        if (approver.status != "PENDING") {
            throw ResponseStatusException(
                HttpStatus.CONFLICT,
                "Approver slot is not PENDING (current: ${approver.status})",
            )
        }
        mutateApproverRow(approverId, "SENT_BACK", actor.userId, comment)
        deriveAndCacheState(recordId)
        auditLogWriter.write(
            actorUserId = actor.userId,
            action = "DRAWING.SEND_BACK",
            entityType = "DRAWING_APPROVER",
            entityId = approverId,
        )
    }

    /**
     * Re-submits a drawing after the Dy CE/C has addressed a send-back.
     *
     * Decision BBBB:
     * - SENT_BACK rows → PENDING.
     * - APPROVED rows → stay APPROVED (unless [ReapproveRequest.requestReApproval] = true,
     *   which signals a substantive change requiring full re-review).
     *
     * Throws 409 if the drawing is not currently SENT_BACK.
     */
    @Transactional
    fun reapprove(
        recordId: UUID,
        actor: PiaPrincipal,
        requestReApproval: Boolean = false,
    ) {
        val record = requireRecordAccess(recordId, actor)
        if (record.recordState != "SENT_BACK") {
            throw ResponseStatusException(
                HttpStatus.CONFLICT,
                "Drawing is not in SENT_BACK state (current: ${record.recordState}); cannot reapprove",
            )
        }

        // Flip SENT_BACK → PENDING
        jdbc.update(
            """
            UPDATE drawing_approvers
               SET status     = 'PENDING',
                   acted_at   = null,
                   comment    = null,
                   updated_at = now()
             WHERE activity_record_id = ?
               AND status = 'SENT_BACK'
               AND NOT is_deleted
            """.trimIndent(),
            recordId,
        )

        // If substantive change: reset APPROVED → PENDING too (decision BBBB)
        if (requestReApproval) {
            jdbc.update(
                """
                UPDATE drawing_approvers
                   SET status     = 'PENDING',
                       acted_at   = null,
                       comment    = null,
                       updated_at = now()
                 WHERE activity_record_id = ?
                   AND status = 'APPROVED'
                   AND NOT is_deleted
                """.trimIndent(),
                recordId,
            )
        }

        deriveAndCacheState(recordId)
        auditLogWriter.write(
            actorUserId = actor.userId,
            action = "DRAWING.REAPPROVE",
            entityType = "ACTIVITY_RECORD",
            entityId = recordId,
        )
    }

    /**
     * Adds a new approver slot to a drawing (Phase 2.7).
     *
     * Gated to DRAWING.EDIT_APPROVERS in the controller (CE/C, Nodal Dy CE/C, Super Admin).
     *
     * [request.designationCode] must be an approval-role designation.
     * [request.position] defaults to max(existing) + 1 if not supplied.
     * If [request.userId] is provided, a notification is sent to that user.
     *
     * Throws 422 if [designationCode] is not a valid approval-role designation.
     */
    @Transactional
    fun addApprover(
        recordId: UUID,
        request: AddApproverRequest,
        actor: PiaPrincipal,
    ): DrawingApproverResponse {
        requireRecordAccess(recordId, actor)
        requireApprovalRoleDesignation(request.designationCode)

        val position =
            request.position
                ?: (
                    jdbc.queryForObject(
                        """
                        SELECT COALESCE(MAX(position), -1) + 1
                          FROM drawing_approvers
                         WHERE activity_record_id = ?
                           AND NOT is_deleted
                        """.trimIndent(),
                        Int::class.java,
                        recordId,
                    ) ?: 0
                )

        val approver =
            DrawingApprover(
                activityRecordId = recordId,
                approvalDesignationCode = request.designationCode,
                userId = request.userId,
                status = "PENDING",
                position = position,
            )
        drawingApproverRepository.save(approver)

        // Notify the newly assigned user (if any)
        request.userId?.let { uid ->
            notificationService.create(
                recipientUserId = uid,
                notificationType = "DRAWING_APPROVER_ADDED",
                title = "You have been added as a drawing approver",
                body = "You have been added to the approver checklist for a drawing record. Please review and act on it.",
                entityType = "ACTIVITY_RECORD",
                entityId = recordId,
                linkUrl = "/activity-records/$recordId/drawing-approvers",
            )
        }

        auditLogWriter.write(
            actorUserId = actor.userId,
            action = "DRAWING.ADD_APPROVER",
            entityType = "DRAWING_APPROVER",
            entityId = approver.id,
        )

        return approver.toResponse()
    }

    /**
     * Soft-deletes an approver slot (Phase 2.7).
     *
     * Gated to DRAWING.EDIT_APPROVERS in the controller.
     *
     * Decision BBBB: APPROVED slots cannot be removed. Throws 409 if the slot
     * is already APPROVED.
     */
    @Transactional
    fun removeApprover(
        recordId: UUID,
        approverId: UUID,
        actor: PiaPrincipal,
    ) {
        requireRecordAccess(recordId, actor)
        val approver = requireApproverSlot(approverId, recordId)

        if (approver.status == "APPROVED") {
            throw ResponseStatusException(
                HttpStatus.CONFLICT,
                "Cannot remove an APPROVED approver slot (decision BBBB); the approver has already signed off",
            )
        }

        jdbc.update(
            """
            UPDATE drawing_approvers
               SET is_deleted  = true,
                   updated_at  = now()
             WHERE id = ?
               AND NOT is_deleted
            """.trimIndent(),
            approverId,
        )

        deriveAndCacheState(recordId)

        auditLogWriter.write(
            actorUserId = actor.userId,
            action = "DRAWING.REMOVE_APPROVER",
            entityType = "DRAWING_APPROVER",
            entityId = approverId,
        )
    }

    /**
     * Reassigns an approver slot to a different user (Phase 2.7).
     *
     * Gated to DRAWING.REASSIGN_APPROVER in the controller (CE/C, Super Admin).
     *
     * Decision BBBB: APPROVED slots cannot be reassigned. Throws 409 if the slot
     * is APPROVED.
     * If [newUserId] is non-null, a notification is sent to the new user.
     */
    @Transactional
    fun reassignApprover(
        recordId: UUID,
        approverId: UUID,
        newUserId: UUID?,
        actor: PiaPrincipal,
    ) {
        requireRecordAccess(recordId, actor)
        val approver = requireApproverSlot(approverId, recordId)

        if (approver.status == "APPROVED") {
            throw ResponseStatusException(
                HttpStatus.CONFLICT,
                "Cannot reassign an APPROVED approver slot (decision BBBB)",
            )
        }

        jdbc.update(
            """
            UPDATE drawing_approvers
               SET user_id    = ?,
                   updated_at = now()
             WHERE id = ?
               AND NOT is_deleted
            """.trimIndent(),
            newUserId,
            approverId,
        )

        newUserId?.let { uid ->
            notificationService.create(
                recipientUserId = uid,
                notificationType = "DRAWING_APPROVER_ADDED",
                title = "You have been assigned as a drawing approver",
                body = "You have been assigned to an approver slot on a drawing record. Please review and act on it.",
                entityType = "ACTIVITY_RECORD",
                entityId = recordId,
                linkUrl = "/activity-records/$recordId/drawing-approvers",
            )
        }

        auditLogWriter.write(
            actorUserId = actor.userId,
            action = "DRAWING.REASSIGN_APPROVER",
            entityType = "DRAWING_APPROVER",
            entityId = approverId,
        )
    }

    // ── State derivation ──────────────────────────────────────────────────────

    /**
     * Derives the overall drawing state from its non-deleted approver rows.
     *
     * | Condition                         | State      |
     * |-----------------------------------|------------|
     * | No rows / all PENDING (pre-submit)| DRAFT      |
     * | Any SENT_BACK                     | SENT_BACK  |
     * | All APPROVED                      | APPROVED   |
     * | Otherwise (at least one PENDING)  | IN_APPROVAL|
     *
     * Note: once a drawing has been submitted the record_state is set to
     * IN_APPROVAL; subsequent derivations never return DRAFT (the rows still
     * exist as PENDING if an approver hasn't acted).  The cached record_state
     * is authoritative for "has this been submitted?".
     */
    fun deriveState(rows: List<DrawingApprover>): String {
        if (rows.isEmpty()) return "DRAFT"
        if (rows.any { it.status == "SENT_BACK" }) return "SENT_BACK"
        if (rows.all { it.status == "APPROVED" }) return "APPROVED"
        return "IN_APPROVAL"
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    /**
     * Verifies [principal] can access the record (zone filter via project).
     * Returns the record for further checks.
     */
    private fun requireRecordAccess(
        recordId: UUID,
        principal: PiaPrincipal,
    ): ActivityRecord {
        val record =
            recordRepository.findByIdAndIsDeletedFalse(recordId)
                ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        val activity =
            activityRepository.findByIdAndIsDeletedFalse(record.projectActivityId)
                ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)

        if (principal.isSuperAdmin) {
            projectRepository.findByIdAndIsDeletedFalse(activity.projectId)
                ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        } else {
            val zones = principal.accessibleZoneIds
            if (zones.isEmpty()) throw ResponseStatusException(HttpStatus.NOT_FOUND)
            projectRepository.findByIdInZones(activity.projectId, zones)
                ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        }
        return record
    }

    /**
     * Validates that [designationCode] exists in the designations table and has
     * [is_approval_role = true].  Throws 422 otherwise.
     */
    private fun requireApprovalRoleDesignation(designationCode: String) {
        val isValid =
            jdbc.queryForObject(
                """
                SELECT EXISTS(
                    SELECT 1 FROM designations
                     WHERE code = ? AND is_approval_role = true
                )
                """.trimIndent(),
                Boolean::class.java,
                designationCode,
            ) ?: false
        if (!isValid) {
            throw ResponseStatusException(
                HttpStatus.UNPROCESSABLE_ENTITY,
                "'$designationCode' is not a valid approval-role designation",
            )
        }
    }

    /**
     * Loads a non-deleted approver row that belongs to [recordId].
     * Throws 404 if not found.
     */
    private fun requireApproverSlot(
        approverId: UUID,
        recordId: UUID,
    ): DrawingApprover {
        val approver =
            drawingApproverRepository.findByIdAndIsDeletedFalse(approverId)
                ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Approver slot not found")
        if (approver.activityRecordId != recordId) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "Approver slot does not belong to this record")
        }
        return approver
    }

    /**
     * Verifies that [actor] is the user assigned to [approver].
     * Super-admins bypass this check.
     */
    private fun requireIsActingApprover(
        approver: DrawingApprover,
        actor: PiaPrincipal,
    ) {
        if (actor.isSuperAdmin) return
        if (approver.userId == null || approver.userId != actor.userId) {
            throw ResponseStatusException(
                HttpStatus.FORBIDDEN,
                "You are not assigned to this approver slot",
            )
        }
    }

    /** SQL UPDATE to flip an approver row's status + acted_at + comment. */
    private fun mutateApproverRow(
        approverId: UUID,
        newStatus: String,
        actorId: UUID,
        comment: String?,
    ) {
        jdbc.update(
            """
            UPDATE drawing_approvers
               SET status     = ?,
                   acted_at   = now(),
                   comment    = ?,
                   updated_at = now()
             WHERE id = ?
               AND NOT is_deleted
            """.trimIndent(),
            newStatus,
            comment,
            approverId,
        )
    }

    /**
     * Re-derives the drawing state from current rows and writes it into
     * [activity_records.record_state].
     */
    private fun deriveAndCacheState(recordId: UUID) {
        // Use JDBC directly to bypass JPA L1 cache which can return stale entities
        // after plain JDBC mutations (mutateApproverRow uses jdbc.update()).
        val statuses =
            jdbc.queryForList(
                """
                SELECT status FROM drawing_approvers
                 WHERE activity_record_id = ?
                   AND NOT is_deleted
                """.trimIndent(),
                String::class.java,
                recordId,
            )
        val state =
            when {
                statuses.isEmpty() -> "DRAFT"
                statuses.any { it == "SENT_BACK" } -> "SENT_BACK"
                statuses.all { it == "APPROVED" } -> "APPROVED"
                else -> "IN_APPROVAL"
            }
        updateRecordState(recordId, state)
    }

    private fun updateRecordState(
        recordId: UUID,
        state: String,
    ) {
        jdbc.update(
            """
            UPDATE activity_records
               SET record_state = ?,
                   updated_at   = now()
             WHERE id = ?
               AND NOT is_deleted
            """.trimIndent(),
            state,
            recordId,
        )
    }

    private fun DrawingApprover.toResponse(): DrawingApproverResponse =
        DrawingApproverResponse(
            id = id,
            approvalDesignationCode = approvalDesignationCode,
            userId = userId,
            status = status,
            position = position,
            actedAt = actedAt,
            comment = comment,
        )
}
