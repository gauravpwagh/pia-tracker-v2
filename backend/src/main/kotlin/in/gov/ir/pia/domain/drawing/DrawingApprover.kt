package `in`.gov.ir.pia.domain.drawing

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

/**
 * One approver slot in a drawing's checklist.
 *
 * Drawings use a record-keeping model: DY CE/C enters the date on which a
 * physical sign-off was received from each approving authority ([approvedOn]).
 * Approving authorities are Railway officials identified by [approvalDesignationCode];
 * they do NOT log in to the system.
 *
 * Derived state (computed on the fly):
 *   - All rows have [approvedOn] set → APPROVED (record_state → AUTHENTICATED)
 *   - Any row has [approvedOn] null  → PENDING  (record_state → DRAFT)
 *
 * Schema: V014 (created) + V029 (dropped workflow columns, added approvedOn/remarks).
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
    /** Display order. */
    @Column(name = "position", nullable = false)
    val position: Int = 0,
    /** Date the physical sign-off was received. Null = not yet approved. */
    @Column(name = "approved_on")
    val approvedOn: LocalDate? = null,
    /** Optional notes recorded by DY CE/C alongside the sign-off date. */
    @Column(name = "remarks")
    val remarks: String? = null,
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
        "DrawingApprover(id=$id, recordId=$activityRecordId, designation=$approvalDesignationCode, approvedOn=$approvedOn)"
}
