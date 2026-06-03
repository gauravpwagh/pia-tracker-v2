package `in`.gov.ir.pia.workflow

import `in`.gov.ir.pia.audit.AuditLogWriter
import `in`.gov.ir.pia.domain.activity.ActivityRecord
import `in`.gov.ir.pia.domain.drawing.DrawingApprover
import `in`.gov.ir.pia.domain.form.FormDefinition
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
import java.util.UUID

// ── DTOs ──────────────────────────────────────────────────────────────────────

data class DrawingApproverResponse(
    val id: UUID,
    val approvalDesignationCode: String,
    /** Human-readable designation name, e.g. "Senior Divisional Engineer". */
    val designationName: String,
    val position: Int,
    /** Date the physical sign-off was received; null = not yet approved. */
    val approvedOn: java.time.LocalDate?,
    val remarks: String?,
)

data class DrawingApproverListResponse(
    val recordId: UUID,
    /** True when all non-deleted slots have an approvedOn date. */
    val allApproved: Boolean,
    val approvers: List<DrawingApproverResponse>,
)

/**
 * Request to record (or clear) an approval date on a slot.
 * [approvedOn] null clears the date (marks the slot as not-yet-approved again).
 */
data class UpdateApprovalRequest(
    val approvedOn: java.time.LocalDate?,
    val remarks: String? = null,
)

/**
 * Request to add a new approver slot.
 * [designationCode] must be an approval-role designation.
 * [position] defaults to max(existing)+1 if not supplied.
 */
data class AddApproverRequest(
    val designationCode: String,
    val position: Int? = null,
)

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * Drawing approver checklist service.
 *
 * Each drawing activity record has a list of approving authorities
 * (by designation code) that were specified when the drawing type was chosen.
 * DY CE/C or Nodal DY CE/C records the date ([approvedOn]) when physical
 * sign-off is received from each authority.
 *
 * Approving authorities do NOT log in to the system.
 *
 * Derived record state (cached on activity_records.record_state):
 *   - All slots approved → AUTHENTICATED
 *   - Any slot pending  → DRAFT
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
) {
    // ── Read ──────────────────────────────────────────────────────────────────

    /**
     * Returns all non-deleted approver rows for [recordId] with the derived
     * allApproved flag (true when every slot has an [approvedOn] date).
     */
    fun listApprovers(
        recordId: UUID,
        principal: PiaPrincipal,
    ): DrawingApproverListResponse {
        requireRecordAccess(recordId, principal)
        val rows = jdbc.query(
            """
            SELECT da.id, da.approval_designation_code, COALESCE(d.name, da.approval_designation_code) AS designation_name,
                   da.position, da.approved_on, da.remarks
              FROM drawing_approvers da
              LEFT JOIN designations d ON d.code = da.approval_designation_code
             WHERE da.activity_record_id = ? AND NOT da.is_deleted
             ORDER BY da.position
            """.trimIndent(),
            { rs, _ -> DrawingApproverResponse(
                id                      = UUID.fromString(rs.getString("id")),
                approvalDesignationCode = rs.getString("approval_designation_code"),
                designationName         = rs.getString("designation_name"),
                position                = rs.getInt("position"),
                approvedOn              = rs.getDate("approved_on")?.toLocalDate(),
                remarks                 = rs.getString("remarks"),
            )},
            recordId,
        )
        return DrawingApproverListResponse(
            recordId    = recordId,
            allApproved = rows.isNotEmpty() && rows.all { it.approvedOn != null },
            approvers   = rows,
        )
    }

    // ── Write ─────────────────────────────────────────────────────────────────

    /**
     * Records (or clears) the sign-off date for an approver slot.
     *
     * Called by DY CE/C or Nodal DY CE/C when physical approval is received.
     * [request.approvedOn] null clears the date (marks slot pending again).
     * After updating, re-derives the overall record state and caches it.
     */
    @Transactional
    fun updateApproval(
        recordId: UUID,
        approverId: UUID,
        request: UpdateApprovalRequest,
        actor: PiaPrincipal,
    ): DrawingApproverResponse {
        requireRecordAccess(recordId, actor)
        val approver = requireApproverSlot(approverId, recordId)

        jdbc.update(
            """
            UPDATE drawing_approvers
               SET approved_on = ?,
                   remarks     = ?,
                   updated_at  = now()
             WHERE id = ?
               AND NOT is_deleted
            """.trimIndent(),
            request.approvedOn,
            request.remarks,
            approverId,
        )

        deriveAndCacheState(recordId)

        auditLogWriter.write(
            actorUserId = actor.userId,
            action      = if (request.approvedOn != null) "DRAWING.APPROVAL_RECORDED" else "DRAWING.APPROVAL_CLEARED",
            entityType  = "DRAWING_APPROVER",
            entityId    = approverId,
        )

        val designationName = jdbc.queryForObject(
            "SELECT COALESCE(name, ?) FROM designations WHERE code = ?",
            String::class.java,
            approver.approvalDesignationCode,
            approver.approvalDesignationCode,
        ) ?: approver.approvalDesignationCode

        return DrawingApproverResponse(
            id                       = approver.id,
            approvalDesignationCode  = approver.approvalDesignationCode,
            designationName          = designationName,
            position                 = approver.position,
            approvedOn               = request.approvedOn,
            remarks                  = request.remarks,
        )
    }

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
            drawingApproverRepository.save(
                DrawingApprover(
                    activityRecordId        = recordId,
                    approvalDesignationCode = designationCode,
                    position                = index,
                )
            )
        }
    }

    /**
     * Adds a new approver slot.
     * Gated to DRAWING.EDIT_APPROVERS (CE/C, DY CE/C, Nodal DY CE/C).
     * [designationCode] must be an approval-role designation.
     */
    @Transactional
    fun addApprover(
        recordId: UUID,
        request: AddApproverRequest,
        actor: PiaPrincipal,
    ): DrawingApproverResponse {
        requireRecordAccess(recordId, actor)
        requireApprovalRoleDesignation(request.designationCode)

        val position = request.position
            ?: (jdbc.queryForObject(
                "SELECT COALESCE(MAX(position), -1) + 1 FROM drawing_approvers WHERE activity_record_id = ? AND NOT is_deleted",
                Int::class.java, recordId,
            ) ?: 0)

        val approver = DrawingApprover(
            activityRecordId        = recordId,
            approvalDesignationCode = request.designationCode,
            position                = position,
        )
        drawingApproverRepository.save(approver)

        auditLogWriter.write(
            actorUserId = actor.userId,
            action      = "DRAWING.ADD_APPROVER",
            entityType  = "DRAWING_APPROVER",
            entityId    = approver.id,
        )

        val designationName = jdbc.queryForObject(
            "SELECT COALESCE(name, ?) FROM designations WHERE code = ?",
            String::class.java,
            request.designationCode,
            request.designationCode,
        ) ?: request.designationCode

        return DrawingApproverResponse(
            id                      = approver.id,
            approvalDesignationCode = approver.approvalDesignationCode,
            designationName         = designationName,
            position                = approver.position,
            approvedOn              = null,
            remarks                 = null,
        )
    }

    /**
     * Soft-deletes an approver slot.
     * Only allowed when [approvedOn] is null (not yet approved).
     */
    @Transactional
    fun removeApprover(
        recordId: UUID,
        approverId: UUID,
        actor: PiaPrincipal,
    ) {
        requireRecordAccess(recordId, actor)
        val approver = requireApproverSlot(approverId, recordId)

        if (approver.approvedOn != null) {
            throw ResponseStatusException(
                HttpStatus.CONFLICT,
                "Cannot remove an already-approved slot; clear the approval date first.",
            )
        }

        jdbc.update(
            "UPDATE drawing_approvers SET is_deleted = true, updated_at = now() WHERE id = ? AND NOT is_deleted",
            approverId,
        )
        deriveAndCacheState(recordId)

        auditLogWriter.write(
            actorUserId = actor.userId,
            action      = "DRAWING.REMOVE_APPROVER",
            entityType  = "DRAWING_APPROVER",
            entityId    = approverId,
        )
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    private fun requireRecordAccess(recordId: UUID, principal: PiaPrincipal): ActivityRecord {
        val record = recordRepository.findByIdAndIsDeletedFalse(recordId)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        val activity = activityRepository.findByIdAndIsDeletedFalse(record.projectActivityId)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        if (principal.isSuperAdmin || principal.permissions.contains("PROJECT.READ.ALL")) {
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

    private fun requireApprovalRoleDesignation(designationCode: String) {
        val isValid = jdbc.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM designations WHERE code = ? AND is_approval_role = true)",
            Boolean::class.java, designationCode,
        ) ?: false
        if (!isValid) throw ResponseStatusException(
            HttpStatus.UNPROCESSABLE_ENTITY,
            "'$designationCode' is not a valid approval-role designation",
        )
    }

    private fun requireApproverSlot(approverId: UUID, recordId: UUID): DrawingApprover {
        val approver = drawingApproverRepository.findByIdAndIsDeletedFalse(approverId)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Approver slot not found")
        if (approver.activityRecordId != recordId)
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "Approver slot does not belong to this record")
        return approver
    }

    /**
     * Re-derives the record state from current approvedOn values and caches it.
     * AUTHENTICATED = all slots approved; DRAFT = any pending.
     */
    private fun deriveAndCacheState(recordId: UUID) {
        val pendingCount = jdbc.queryForObject(
            "SELECT COUNT(*) FROM drawing_approvers WHERE activity_record_id = ? AND approved_on IS NULL AND NOT is_deleted",
            Long::class.java, recordId,
        ) ?: 0L
        val state = if (pendingCount == 0L) "AUTHENTICATED" else "DRAFT"
        jdbc.update(
            "UPDATE activity_records SET record_state = ?, updated_at = now() WHERE id = ? AND NOT is_deleted",
            state, recordId,
        )
    }

}
