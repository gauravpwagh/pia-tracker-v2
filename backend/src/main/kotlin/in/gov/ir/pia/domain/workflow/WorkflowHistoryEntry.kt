package `in`.gov.ir.pia.domain.workflow

import com.fasterxml.jackson.databind.JsonNode
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.FetchType
import jakarta.persistence.Id
import jakarta.persistence.JoinColumn
import jakarta.persistence.ManyToOne
import jakarta.persistence.Table
import org.hibernate.annotations.JdbcTypeCode
import org.hibernate.type.SqlTypes
import java.time.Instant
import java.util.UUID

/**
 * Immutable audit row written by [WorkflowServiceImpl.transition] for every
 * state change.  Stored in a monthly-partitioned table; never updated.
 *
 * [fromState]  — null only for the very first "start" entry (initial state has
 *                no prior state).
 * [transition] — null for the same reason.
 */
@Entity
@Table(name = "workflow_history")
class WorkflowHistoryEntry(
    @Id
    val id: UUID = UUID.randomUUID(),
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "workflow_instance_id", nullable = false)
    val workflowInstance: WorkflowInstance,
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "from_state_id")
    val fromState: WorkflowState?,
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "to_state_id", nullable = false)
    val toState: WorkflowState,
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "transition_id")
    val transition: WorkflowTransition?,
    @Column(name = "actor_user_id", nullable = false)
    val actorUserId: UUID,
    @Column(name = "comment")
    val comment: String? = null,
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "observation_json", columnDefinition = "jsonb")
    val observationJson: JsonNode? = null,
    @Column(name = "at", nullable = false, updatable = false)
    val at: Instant = Instant.now(),
)
