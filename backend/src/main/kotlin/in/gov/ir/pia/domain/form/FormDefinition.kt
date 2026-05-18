package `in`.gov.ir.pia.domain.form

import com.fasterxml.jackson.databind.JsonNode
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import org.hibernate.annotations.JdbcTypeCode
import org.hibernate.type.SqlTypes
import java.time.Instant
import java.util.UUID

/**
 * JPA entity for the `form_definitions` table.
 *
 * Each row is one versioned form definition.  The JSON Schema lives in
 * [schemaJson]; validation uses networknt's json-schema-validator.
 *
 * Rules:
 * - No bidirectional associations.
 * - Equality by [id].
 * - [schemaJson] and [uiSchemaJson] are opaque on the entity side;
 *   [FormDefinitionService] interprets their content.
 * - [sectionCodes] is empty for record-level-workflow forms.
 * - [defaultApproverDesignations] applies to drawing form definitions only.
 */
@Entity
@Table(name = "form_definitions")
class FormDefinition(
    @Id
    val id: UUID = UUID.randomUUID(),
    @Column(name = "activity_type_code", nullable = false, length = 64)
    val activityTypeCode: String,
    @Column(name = "code", nullable = false, length = 64)
    val code: String,
    @Column(name = "version", nullable = false)
    val version: Int,
    @Column(name = "label", nullable = false, length = 256)
    val label: String,
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "schema_json", nullable = false, columnDefinition = "jsonb")
    val schemaJson: JsonNode,
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "ui_schema_json", nullable = false, columnDefinition = "jsonb")
    val uiSchemaJson: JsonNode,
    /** Nullable FK to workflow_definitions; null for drawings and stubs. */
    @Column(name = "workflow_definition_id")
    val workflowDefinitionId: UUID? = null,
    /**
     * Ordered section codes for section-level-workflow forms
     * (e.g. Land Acquisition has 9 sections).
     * Empty for record-level-workflow forms.
     */
    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "section_codes", columnDefinition = "text[]")
    val sectionCodes: Array<String> = emptyArray(),
    /** Drawing forms only: designations that appear on the default approver list. */
    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "default_approver_designations", columnDefinition = "text[]")
    val defaultApproverDesignations: Array<String> = emptyArray(),
    @Column(name = "is_active", nullable = false)
    val isActive: Boolean = true,
    @Column(name = "created_at", nullable = false, updatable = false)
    val createdAt: Instant = Instant.now(),
    @Column(name = "created_by_user_id")
    val createdByUserId: UUID? = null,
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is FormDefinition) return false
        return id == other.id
    }

    override fun hashCode(): Int = id.hashCode()

    override fun toString(): String = "FormDefinition(id=$id, code=$code, version=$version)"
}
