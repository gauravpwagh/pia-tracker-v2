package `in`.gov.ir.pia.domain.workflow

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.FetchType
import jakarta.persistence.Id
import jakarta.persistence.JoinColumn
import jakarta.persistence.ManyToOne
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

/**
 * A running workflow instance — one per entity (project, activity-record, or
 * section within a record).
 *
 * [entityType]     — "PROJECT" or "ACTIVITY_RECORD".
 * [entityId]       — FK into the owning table (not a hard DB FK since the target
 *                    tables vary; enforced at the service layer).
 * [sectionCode]    — null for record-level and project-level instances; set for
 *                    section-level (one instance per section code per record).
 * [sentBackMarker] — true when the instance has been sent back at least once in
 *                    the current cycle (cleared on successful re-advance).
 *
 * The [currentState] column is the **only** authoritative state.
 * [activity_records.record_state] is a derived cache updated by the service.
 */
@Entity
@Table(name = "workflow_instances")
class WorkflowInstance(
    @Id
    val id: UUID = UUID.randomUUID(),
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "workflow_definition_id", nullable = false)
    val workflowDefinition: WorkflowDefinition,
    @Column(name = "entity_type", nullable = false, length = 32)
    val entityType: String,
    @Column(name = "entity_id", nullable = false)
    val entityId: UUID,
    @Column(name = "section_code", length = 64)
    val sectionCode: String? = null,
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "current_state_id", nullable = false)
    var currentState: WorkflowState,
    @Column(name = "entered_state_at", nullable = false)
    var enteredStateAt: Instant = Instant.now(),
    @Column(name = "last_actor_user_id")
    var lastActorUserId: UUID? = null,
    @Column(name = "sent_back_marker", nullable = false)
    var sentBackMarker: Boolean = false,
    @Column(name = "created_at", nullable = false, updatable = false)
    val createdAt: Instant = Instant.now(),
)
