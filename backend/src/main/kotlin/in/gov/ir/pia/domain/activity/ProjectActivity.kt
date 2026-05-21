package `in`.gov.ir.pia.domain.activity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import jakarta.persistence.Version
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

/**
 * One work-package under a project: e.g. "Phase 1 Land Acquisition" or
 * "Drawing Approval — Ambala–Ludhiana".
 *
 * Schema created by `V006__activity_records_full.sql`.
 *
 * Key rules (domain/CLAUDE.md):
 * - Identity by [id]; no `data class`.
 * - `@Version` for optimistic locking.
 * - [status] is updated by [ActivityService]; never written directly.
 * - Multiple activities of the same [activityTypeCode] are allowed on one
 *   project (decision YYY — "Phase 1 LA" and "Phase 2 LA" are separate rows).
 * - [defaultFormDefinitionId] references the form definition used for new
 *   records under this activity; may be null until Phase 1.10 seeds the full
 *   form schema.
 */
@Entity
@Table(name = "project_activities")
class ProjectActivity(
    @Id
    val id: UUID = UUID.randomUUID(),
    @Column(name = "project_id", nullable = false)
    val projectId: UUID,
    @Column(name = "activity_type_code", nullable = false, length = 64)
    val activityTypeCode: String,
    @Column(name = "name", nullable = false, length = 256)
    val name: String,
    @Column(name = "scope_notes")
    val scopeNotes: String? = null,
    @Column(name = "target_completion_date")
    val targetCompletionDate: LocalDate? = null,
    /** The Dy CE/C who owns this activity (the creator). */
    @Column(name = "primary_dyce_user_id", nullable = false)
    val primaryDyceUserId: UUID,
    /** NOT_STARTED / IN_PROGRESS / COMPLETED / ON_HOLD / CANCELLED */
    @Column(name = "status", nullable = false, length = 32)
    val status: String = "NOT_STARTED",
    /** FK to the active form definition for this activity type. Null until Phase 1.10. */
    @Column(name = "default_form_definition_id")
    val defaultFormDefinitionId: UUID? = null,
    @Column(name = "default_workflow_definition_id")
    val defaultWorkflowDefinitionId: UUID? = null,
    @Column(name = "created_by_user_id", nullable = false)
    val createdByUserId: UUID,
    @Column(name = "updated_by_user_id")
    val updatedByUserId: UUID? = null,
    // ── Soft delete ───────────────────────────────────────────────────────────
    @Column(name = "is_deleted", nullable = false)
    val isDeleted: Boolean = false,
    @Column(name = "deleted_at")
    val deletedAt: Instant? = null,
    @Column(name = "deleted_by_user_id")
    val deletedByUserId: UUID? = null,
    // ── Audit timestamps ──────────────────────────────────────────────────────
    @Column(name = "created_at", nullable = false, updatable = false)
    val createdAt: Instant = Instant.now(),
    @Column(name = "updated_at", nullable = false)
    val updatedAt: Instant = Instant.now(),
    @Version
    val version: Int = 0,
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is ProjectActivity) return false
        return id == other.id
    }

    override fun hashCode(): Int = id.hashCode()

    override fun toString(): String = "ProjectActivity(id=$id, projectId=$projectId, type=$activityTypeCode, status=$status)"
}
