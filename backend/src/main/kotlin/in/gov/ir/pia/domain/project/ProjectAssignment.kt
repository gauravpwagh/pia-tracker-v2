package `in`.gov.ir.pia.domain.project

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

/**
 * Tracks per-project role assignments: CAO_C / CE_C / DY_CE_C / NODAL_DY_CE_C.
 *
 * Schema created by `V005__projects_full.sql`.
 *
 * Rules (domain/CLAUDE.md):
 * - Identity by [id]; no `data class`.
 * - `@Version` omitted — assignments are deactivated, not updated in place.
 * - Soft-deactivation via [isActive]; rows are never hard-deleted.
 * - No bidirectional associations, no cascade attributes.
 */
@Entity
@Table(name = "project_assignments")
class ProjectAssignment(
    @Id
    val id: UUID = UUID.randomUUID(),
    @Column(name = "project_id", nullable = false)
    val projectId: UUID,
    @Column(name = "user_id", nullable = false)
    val userId: UUID,
    /** CAO_C / CE_C / DY_CE_C / NODAL_DY_CE_C */
    @Column(name = "assignment_role", nullable = false, length = 32)
    val assignmentRole: String,
    @Column(name = "assigned_by_user_id", nullable = false)
    val assignedByUserId: UUID,
    @Column(name = "assigned_at", nullable = false)
    val assignedAt: Instant = Instant.now(),
    @Column(name = "is_active", nullable = false)
    val isActive: Boolean = true,
    @Column(name = "deactivated_at")
    val deactivatedAt: Instant? = null,
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is ProjectAssignment) return false
        return id == other.id
    }

    override fun hashCode(): Int = id.hashCode()

    override fun toString(): String =
        "ProjectAssignment(id=$id, projectId=$projectId, userId=$userId, " +
            "role=$assignmentRole, active=$isActive)"
}
