package `in`.gov.ir.pia.repository

import `in`.gov.ir.pia.domain.activity.ProjectActivity
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import java.util.UUID

/**
 * JPA repository for [ProjectActivity].
 *
 * Zone-level filtering is the responsibility of the service layer: the service
 * verifies the principal can access the parent project before calling these
 * methods.  List methods here filter only by project ID and soft-delete.
 */
interface ProjectActivityRepository : JpaRepository<ProjectActivity, UUID> {
    /** All non-deleted activities for a project, ordered for stable display. */
    fun findAllByProjectIdAndIsDeletedFalseOrderByCreatedAtAsc(projectId: UUID): List<ProjectActivity>

    /** Single non-deleted activity by ID. Returns null → 404 in service. */
    fun findByIdAndIsDeletedFalse(id: UUID): ProjectActivity?

    /**
     * Returns non-deleted activities on [projectId] where [userId] is the
     * primary Dy CE/C ([primaryDyceUserId]).
     *
     * Used to filter the activity list for DY_CE_C principals who should only
     * see activities they are personally assigned to.
     */
    fun findAllByProjectIdAndPrimaryDyceUserIdAndIsDeletedFalseOrderByCreatedAtAsc(
        projectId: UUID,
        primaryDyceUserId: UUID,
    ): List<ProjectActivity>

    /**
     * Existence check: is [userId] the [primaryDyceUserId] of any active
     * activity on [projectId]?  Used by the assignment guard in
     * [ActivityService.create].
     */
    @Query(
        "SELECT COUNT(a) > 0 FROM ProjectActivity a " +
            "WHERE a.projectId = :projectId " +
            "  AND a.primaryDyceUserId = :userId " +
            "  AND a.isDeleted = false",
    )
    fun existsByProjectIdAndPrimaryDyceUserId(
        @Param("projectId") projectId: UUID,
        @Param("userId") userId: UUID,
    ): Boolean

    /**
     * Is there already a non-deleted activity of [activityTypeCode] on
     * [projectId]?
     *
     * A project may hold at most ONE non-deleted activity of each type
     * (one Land Acquisition, one Utility Shifting, …). Variation within a type
     * — villages, sections, award phases — is modelled as records inside the
     * single activity, never as a second activity. This existence check is the
     * application-layer guard; the partial unique index
     * `ux_pact_project_type` is the race-proof physical backstop.
     */
    fun existsByProjectIdAndActivityTypeCodeAndIsDeletedFalse(
        projectId: UUID,
        activityTypeCode: String,
    ): Boolean
}
