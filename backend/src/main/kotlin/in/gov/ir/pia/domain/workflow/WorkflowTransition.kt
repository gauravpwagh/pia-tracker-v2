package `in`.gov.ir.pia.domain.workflow

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.FetchType
import jakarta.persistence.Id
import jakarta.persistence.JoinColumn
import jakarta.persistence.ManyToOne
import jakarta.persistence.Table
import java.util.UUID

/**
 * A permitted state transition within a [WorkflowDefinition].
 *
 * [roleRequiredCode] = the role that must initiate this transition.
 * [requiresComment] = actor must supply a non-blank comment string.
 * [isBackward]      = true for send-back transitions; used to set
 *                     [WorkflowInstance.sentBackMarker].
 */
@Entity
@Table(name = "workflow_transitions")
class WorkflowTransition(
    @Id
    val id: UUID,
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "workflow_definition_id", nullable = false)
    val workflowDefinition: WorkflowDefinition,
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "from_state_id", nullable = false)
    val fromState: WorkflowState,
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "to_state_id", nullable = false)
    val toState: WorkflowState,
    @Column(name = "action_code", nullable = false, length = 64)
    val actionCode: String,
    @Column(name = "action_label", nullable = false, length = 128)
    val actionLabel: String,
    @Column(name = "role_required_code", length = 64)
    val roleRequiredCode: String?,
    @Column(name = "requires_comment", nullable = false)
    val requiresComment: Boolean,
    @Column(name = "is_backward", nullable = false)
    val isBackward: Boolean,
)
