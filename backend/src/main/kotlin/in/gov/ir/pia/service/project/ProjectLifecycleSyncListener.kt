package `in`.gov.ir.pia.service.project

import `in`.gov.ir.pia.workflow.WorkflowStateChangedEvent
import org.springframework.context.event.EventListener
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component

/**
 * Keeps [Project.lifecycleState] in sync with the workflow engine after every
 * PROJECT transition.
 *
 * Listens for [WorkflowStateChangedEvent] in the **same DB transaction** as
 * the originating [WorkflowService.transition] call (Spring's default
 * ApplicationEventPublisher mode).  If the transition rolls back, this update
 * rolls back with it.
 *
 * Uses [JdbcTemplate] (not JPA) to:
 * - Avoid flushing the Hibernate L1 cache for a stale entity instance.
 * - Bypass the optimistic-lock `@Version` increment — the workflow engine is
 *   the authoritative source of truth; this is purely a denormalized cache.
 *
 * Only fires for `entityType == "PROJECT"`.
 */
@Component
class ProjectLifecycleSyncListener(
    private val jdbc: JdbcTemplate,
) {
    @EventListener
    fun onWorkflowStateChanged(event: WorkflowStateChangedEvent) {
        if (event.entityType != "PROJECT") return
        jdbc.update(
            "UPDATE projects SET lifecycle_state = ? WHERE id = ?",
            event.toStateCode,
            event.entityId,
        )
    }
}
