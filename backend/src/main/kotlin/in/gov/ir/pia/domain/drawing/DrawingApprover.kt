package `in`.gov.ir.pia.domain.drawing

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

/**
 * One approver slot in a drawing's checklist.
 *
 * Drawings use the checklist model (docs/workflow.md § 5), completely separate
 * from the workflow engine.  Each row is one required sign-off; overall drawing
 * state is derived by [DrawingService.deriveState].
 *
 * Schema: `V014__drawing_approvers.sql`.
 *
 * Key rules:
 * - [status] is PENDING / APPROVED / SENT_BACK.
 * - [userId] is null when the slot has not yet been filled (multiple users match
 *   the designation in the project zone, or no user matches at all).
 * - Soft-deleted rows ([isDeleted] = true) are invisible for state derivation but
 *   retained for audit history (decision BBBB).
 * - No [Version] / ETag — drawing approver rows are mutated through
 *   [DrawingService] which uses row-level SQL UPDATEs with explicit WHERE clauses.
 * - Equality by [id]; no `data class`.
 */
@Entity
@Table(name = "drawing_approvers")
class DrawingApprover(
    @Id
    val id: UUID = UUID.randomUUID(),
    @Column(name = "activity_record_id", nullable = false)
    val activityRecordId: UUID,
    @Column(name = "approval_designation_code", nullable = false, length = 32)
    val approvalDesignationCode: String,
    @Column(name = "user_id")
    val userId: UUID? = null,
    /** PENDING / APPROVED / SENT_BACK */
    @Column(name = "status", nullable = false, length = 16)
    val status: String = "PENDING",
    /** Display order; not an enforcement order. */
    @Column(name = "position", nullable = false)
    val position: Int = 0,
    @Column(name = "acted_at")
    val actedAt: Instant? = null,
    @Column(name = "comment")
    val comment: String? = null,
    @Column(name = "is_deleted", nullable = false)
    val isDeleted: Boolean = false,
    @Column(name = "created_at", nullable = false, updatable = false)
    val createdAt: Instant = Instant.now(),
    @Column(name = "updated_at", nullable = false)
    val updatedAt: Instant = Instant.now(),
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is DrawingApprover) return false
        return id == other.id
    }

    override fun hashCode(): Int = id.hashCode()

    override fun toString(): String =
        "DrawingApprover(id=$id, recordId=$activityRecordId, designation=$approvalDesignationCode, status=$status)"
}
