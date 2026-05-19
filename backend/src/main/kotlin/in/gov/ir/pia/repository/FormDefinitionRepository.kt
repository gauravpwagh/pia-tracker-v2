package `in`.gov.ir.pia.repository

import `in`.gov.ir.pia.domain.form.FormDefinition
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import java.util.UUID

/**
 * Repository for [FormDefinition].
 *
 * List methods return only active definitions.  The admin form editor uses
 * separate queries (not through this interface) to access inactive versions.
 */
interface FormDefinitionRepository : JpaRepository<FormDefinition, UUID> {
    /** All active form definitions, ordered by activity type then code. */
    fun findAllByIsActiveTrueOrderByActivityTypeCodeAscCodeAsc(): List<FormDefinition>

    /**
     * The latest active version of a specific form code.
     *
     * "Latest" means the highest [FormDefinition.version] among active rows
     * with the given code.
     */
    @Query(
        "SELECT f FROM FormDefinition f " +
            "WHERE f.code = :code AND f.isActive = true " +
            "ORDER BY f.version DESC " +
            "LIMIT 1",
    )
    fun findLatestActiveByCode(
        @Param("code") code: String,
    ): FormDefinition?

    /**
     * The latest active form definition for a given [activityTypeCode].
     *
     * Used by [ActivityService] to resolve the default form definition when
     * creating a new [ProjectActivity].  Returns null when no form definition
     * has been seeded for the given activity type yet (later phases add them).
     */
    @Query(
        "SELECT f FROM FormDefinition f " +
            "WHERE f.activityTypeCode = :activityTypeCode AND f.isActive = true " +
            "ORDER BY f.version DESC " +
            "LIMIT 1",
    )
    fun findLatestActiveByActivityTypeCode(
        @Param("activityTypeCode") activityTypeCode: String,
    ): FormDefinition?
}
