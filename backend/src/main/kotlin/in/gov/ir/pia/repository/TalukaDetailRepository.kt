package `in`.gov.ir.pia.repository

import `in`.gov.ir.pia.domain.activity.TalukaDetail
import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

/**
 * JPA repository for [TalukaDetail].
 *
 * Service layer verifies the principal can access the parent activity before
 * calling these methods.
 */
interface TalukaDetailRepository : JpaRepository<TalukaDetail, UUID> {
    /** All non-deleted talukas for an activity, alphabetical. */
    fun findAllByProjectActivityIdAndIsDeletedFalseOrderByTalukaNameAsc(projectActivityId: UUID): List<TalukaDetail>

    /** Single non-deleted taluka. Returns null → 404 in service. */
    fun findByIdAndIsDeletedFalse(id: UUID): TalukaDetail?

    /** Case-insensitive name clash check within the same activity (excludes soft-deleted rows). */
    fun existsByProjectActivityIdAndTalukaNameIgnoreCaseAndIsDeletedFalse(
        projectActivityId: UUID,
        talukaName: String,
    ): Boolean
}
