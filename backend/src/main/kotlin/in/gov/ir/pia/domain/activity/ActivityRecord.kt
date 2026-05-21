package `in`.gov.ir.pia.domain.activity

import com.fasterxml.jackson.databind.JsonNode
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import jakarta.persistence.Version
import org.hibernate.annotations.JdbcTypeCode
import org.hibernate.type.SqlTypes
import java.time.Instant
import java.util.UUID

/**
 * One unit of data entry under a [ProjectActivity]: a village (Land
 * Acquisition), a drawing (Drawing Approval), a utility item (Utility
 * Shifting), etc.
 *
 * Schema created by `V006__activity_records_full.sql`.
 *
 * Key rules:
 * - [recordState] is a **cache** of the workflow instance state; the
 *   source of truth is `workflow_instances.current_state_id`.  In Phase
 *   1.8 records start as DRAFT and have no workflow instance yet.
 * - [dataJson] holds the form submission; always `{}` at creation (Phase
 *   1.8).  RJSF integration and validation come in Phase 1.9–1.10.
 * - [schemaVersionAtSave] captures which form-definition version the data
 *   was last validated against; set from [FormDefinition.version] at save.
 * - [recordSubtype] discriminates records within an activity (e.g.,
 *   ESP / SIP for drawings; null for Land Acquisition).
 * - Identity by [id]; no `data class`.
 * - `@Version` for optimistic locking.
 */
@Entity
@Table(name = "activity_records")
class ActivityRecord(
    @Id
    val id: UUID = UUID.randomUUID(),
    @Column(name = "project_activity_id", nullable = false)
    val projectActivityId: UUID,
    @Column(name = "form_definition_id", nullable = false)
    val formDefinitionId: UUID,
    @Column(name = "workflow_definition_id")
    val workflowDefinitionId: UUID? = null,
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "data_json", nullable = false, columnDefinition = "jsonb")
    val dataJson: JsonNode,
    /** Snapshot of [FormDefinition.version] at last save. */
    @Column(name = "schema_version_at_save", nullable = false)
    val schemaVersionAtSave: Int,
    /** DRAFT / SUBMITTED_FOR_VERIFICATION / VERIFIED / AUTHENTICATED / SENT_BACK_TO_DYCE / SENT_BACK_TO_NODAL */
    @Column(name = "record_state", nullable = false, length = 32)
    val recordState: String = "DRAFT",
    /** Discriminator: null for LA; drawing sub-type code for drawing records. */
    @Column(name = "record_subtype", length = 64)
    val recordSubtype: String? = null,
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
        if (other !is ActivityRecord) return false
        return id == other.id
    }

    override fun hashCode(): Int = id.hashCode()

    override fun toString(): String = "ActivityRecord(id=$id, activityId=$projectActivityId, state=$recordState)"
}
