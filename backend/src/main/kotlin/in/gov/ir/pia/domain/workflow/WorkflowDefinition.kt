package `in`.gov.ir.pia.domain.workflow

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

/**
 * Persisted workflow definition row.  Immutable after creation — schema changes
 * produce a new version row; existing instances keep their version pointer.
 *
 * [appliesTo] is one of: PROJECT, RECORD, SECTION.
 */
@Entity
@Table(name = "workflow_definitions")
class WorkflowDefinition(
    @Id
    val id: UUID,
    @Column(name = "code", nullable = false, length = 64)
    val code: String,
    @Column(name = "version", nullable = false)
    val version: Int,
    @Column(name = "label", nullable = false, length = 256)
    val label: String,
    @Column(name = "applies_to", nullable = false, length = 32)
    val appliesTo: String,
    @Column(name = "is_active", nullable = false)
    val isActive: Boolean,
    @Column(name = "created_at", nullable = false, updatable = false)
    val createdAt: Instant,
)
