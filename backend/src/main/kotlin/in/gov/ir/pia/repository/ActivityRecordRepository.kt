package `in`.gov.ir.pia.repository

import `in`.gov.ir.pia.domain.activity.ActivityRecord
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
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

    /**
     * Count of Land Acquisition records under [projectActivityId] whose
     * `acquisition_details.sub_division_taluka` matches [talukaName] (case-insensitive).
     * Used to block deleting a taluka master row that's still referenced.
     */
    @Query(
        value = """
            SELECT count(*) FROM activity_records
             WHERE project_activity_id = :projectActivityId
               AND is_deleted = false
               AND lower(data_json #>> '{acquisition_details,sub_division_taluka}') = lower(:talukaName)
        """,
        nativeQuery = true,
    )
    fun countByActivityAndSubDivisionTaluka(
        @Param("projectActivityId") projectActivityId: UUID,
        @Param("talukaName") talukaName: String,
    ): Long

    /**
     * Reassigns every non-deleted record from [sourceActivityId] to
     * [targetActivityId]. Used by [in.gov.ir.pia.service.activity.ActivityService.mergeActivities]
     * to fold an accidental duplicate activity's records into the real one
     * before soft-deleting the duplicate. Returns the number of rows moved.
     */
    @Modifying
    @Query(
        "UPDATE ActivityRecord ar SET ar.projectActivityId = :targetActivityId " +
            "WHERE ar.projectActivityId = :sourceActivityId AND ar.isDeleted = false",
    )
    fun reassignActivity(
        @Param("sourceActivityId") sourceActivityId: UUID,
        @Param("targetActivityId") targetActivityId: UUID,
    ): Int
}
