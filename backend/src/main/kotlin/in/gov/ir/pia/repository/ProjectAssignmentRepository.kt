package `in`.gov.ir.pia.repository

import `in`.gov.ir.pia.domain.project.ProjectAssignment
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import java.util.UUID

/**
 * JPA repository for [ProjectAssignment].
 *
 * All write operations use JPA save().  Deactivations that need to bypass
 * the immutable-field constraint (all fields are `val`) use [JdbcTemplate]
 * directly in the service layer.
 */
interface ProjectAssignmentRepository : JpaRepository<ProjectAssignment, UUID> {
    /** All active assignments for a project. */
    fun findAllByProjectIdAndIsActiveTrue(projectId: UUID): List<ProjectAssignment>

    /** All active assignments for a project filtered by role. */
    fun findAllByProjectIdAndAssignmentRoleAndIsActiveTrue(
        projectId: UUID,
        assignmentRole: String,
    ): List<ProjectAssignment>

    /**
     * Returns the active NODAL_DY_CE_C assignment for a project, or null.
     * There is at most one active Nodal per project at any time.
     */
    @Query(
        "SELECT a FROM ProjectAssignment a " +
            "WHERE a.projectId = :projectId " +
            "  AND a.assignmentRole = 'NODAL_DY_CE_C' " +
            "  AND a.isActive = true",
    )
    fun findActiveNodalForProject(
        @Param("projectId") projectId: UUID,
    ): ProjectAssignment?
}
