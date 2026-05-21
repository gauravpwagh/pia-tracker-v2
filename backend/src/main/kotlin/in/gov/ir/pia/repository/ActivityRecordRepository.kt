package `in`.gov.ir.pia.repository

import `in`.gov.ir.pia.domain.activity.ActivityRecord
import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

/**
 * JPA repository for [ActivityRecord].
 *
 * Phase 1.8: basic list + get.  Workflow and RJSF operations added in Phase 1.9–1.10.
 *
 * Service layer verifies the principal can access the parent activity before
 * calling these methods.
 */
interface ActivityRecordRepository : JpaRepository<ActivityRecord, UUID> {
    /** All non-deleted records for an activity. */
    fun findAllByProjectActivityIdAndIsDeletedFalseOrderByCreatedAtAsc(projectActivityId: UUID): List<ActivityRecord>

    /** All non-deleted records for an activity filtered by subtype (e.g. utility type). */
    fun findAllByProjectActivityIdAndRecordSubtypeAndIsDeletedFalseOrderByCreatedAtAsc(
        projectActivityId: UUID,
        recordSubtype: String,
    ): List<ActivityRecord>

    /** Single non-deleted record. Returns null → 404 in service. */
    fun findByIdAndIsDeletedFalse(id: UUID): ActivityRecord?
}
