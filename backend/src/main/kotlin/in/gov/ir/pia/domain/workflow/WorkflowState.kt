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
 * A single state within a [WorkflowDefinition].
 *
 * [roleRequiredCode] = the role that must ACT when an instance is in this state
 * (used for inbox queries and SLA attribution).  Nullable for terminal states
 * or states that have no designated actor (e.g. ACTIVE, COMPLETED).
 */
@Entity
@Table(name = "workflow_states")
class WorkflowState(
    @Id
    val id: UUID,
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "workflow_definition_id", nullable = false)
    val workflowDefinition: WorkflowDefinition,
    @Column(name = "code", nullable = false, length = 64)
    val code: String,
    @Column(name = "label", nullable = false, length = 128)
    val label: String,
    @Column(name = "is_initial", nullable = false)
    val isInitial: Boolean,
    @Column(name = "is_terminal", nullable = false)
    val isTerminal: Boolean,
    @Column(name = "role_required_code", length = 64)
    val roleRequiredCode: String?,
    @Column(name = "sla_days")
    val slaDays: Int?,
    @Column(name = "sla_warning_days")
    val slaWarningDays: Int?,
    @Column(name = "display_color", length = 16)
    val displayColor: String?,
)
