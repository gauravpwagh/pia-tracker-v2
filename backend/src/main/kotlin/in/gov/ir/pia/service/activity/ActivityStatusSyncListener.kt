package `in`.gov.ir.pia.service.activity

import `in`.gov.ir.pia.workflow.WorkflowStateChangedEvent
import org.slf4j.LoggerFactory
import org.springframework.context.event.EventListener
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component

/**
 * Keeps [project_activities.status] in sync with the activity's workflow state.
 *
 * Runs inside the same DB transaction as the originating transition — rolls back
 * atomically if the transition fails.
 *
 * Only handles entityType == "PROJECT_ACTIVITY". Record-level workflow transitions
 * (entityType == "ACTIVITY_RECORD") are handled by SummaryUpdater.
 */
@Component
class ActivityStatusSyncListener(
    private val jdbc: JdbcTemplate,
) {
    private val log = LoggerFactory.getLogger(ActivityStatusSyncListener::class.java)

    @EventListener
    fun onWorkflowStateChanged(event: WorkflowStateChangedEvent) {
        if (event.entityType != "PROJECT_ACTIVITY") return

        val updated =
            jdbc.update(
                "UPDATE project_activities SET status = ?, updated_at = NOW() WHERE id = ?",
                event.toStateCode,
                event.entityId,
            )

        if (updated == 0) {
            log.warn("ActivityStatusSyncListener: no activity row found for id={}", event.entityId)
        } else {
            log.debug("ActivityStatusSyncListener: activity {} status → {}", event.entityId, event.toStateCode)
        }
    }
}
