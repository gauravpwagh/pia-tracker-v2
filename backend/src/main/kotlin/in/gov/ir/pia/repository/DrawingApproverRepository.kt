package `in`.gov.ir.pia.repository

import `in`.gov.ir.pia.domain.drawing.DrawingApprover
import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

/**
 * JPA repository for [DrawingApprover].
 *
 * Service layer verifies access permissions before calling these methods.
 */
interface DrawingApproverRepository : JpaRepository<DrawingApprover, UUID> {
    /** All non-deleted approver rows for a drawing record, ordered by display position. */
    fun findAllByActivityRecordIdAndIsDeletedFalseOrderByPositionAsc(activityRecordId: UUID): List<DrawingApprover>

    /** Single non-deleted approver row. Returns null → 404 in service. */
    fun findByIdAndIsDeletedFalse(id: UUID): DrawingApprover?
}
