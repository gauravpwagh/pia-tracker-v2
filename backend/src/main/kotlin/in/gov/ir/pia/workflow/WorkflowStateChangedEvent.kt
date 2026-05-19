package `in`.gov.ir.pia.workflow

import `in`.gov.ir.pia.security.Principal
import java.util.UUID

/**
 * Domain event fired after every successful workflow transition (inside the
 * same DB transaction).
 *
 * Listeners (e.g. SummaryUpdater, NotificationService) subscribe to this event.
 * For Phase 1.6 no listeners are registered yet; this just establishes the
 * contract.
 */
data class WorkflowStateChangedEvent(
    val instanceId: UUID,
    val entityType: String,
    val entityId: UUID,
    val sectionCode: String?,
    val fromStateCode: String?,
    val toStateCode: String,
    val actor: Principal,
)
