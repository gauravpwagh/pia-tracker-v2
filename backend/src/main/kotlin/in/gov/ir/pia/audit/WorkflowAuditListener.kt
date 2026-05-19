package `in`.gov.ir.pia.audit

import com.fasterxml.jackson.databind.ObjectMapper
import `in`.gov.ir.pia.workflow.WorkflowStateChangedEvent
import org.springframework.context.event.EventListener
import org.springframework.stereotype.Component

/**
 * Writes an audit row for every successful workflow transition.
 *
 * Runs inside the same DB transaction as the originating [WorkflowStateChangedEvent]
 * (Spring's default synchronous event dispatch), so audit rows are rolled back
 * if the enclosing transaction fails.
 *
 * Action code format: "WORKFLOW.<toStateCode>" — e.g. "WORKFLOW.SUBMITTED".
 */
@Component
class WorkflowAuditListener(
    private val auditLogWriter: AuditLogWriter,
    private val objectMapper: ObjectMapper,
) {
    @EventListener
    fun onWorkflowStateChanged(event: WorkflowStateChangedEvent) {
        val beforeJson = event.fromStateCode?.let {
            objectMapper.createObjectNode().apply {
                put("stateCode", it)
                event.sectionCode?.let { s -> put("sectionCode", s) }
            }
        }
        val afterJson = objectMapper.createObjectNode().apply {
            put("stateCode", event.toStateCode)
            event.sectionCode?.let { s -> put("sectionCode", s) }
            put("instanceId", event.instanceId.toString())
        }

        auditLogWriter.write(
            actorUserId = event.actor.userId,
            action = "WORKFLOW.${event.toStateCode}",
            entityType = event.entityType,
            entityId = event.entityId,
            beforeJson = beforeJson,
            afterJson = afterJson,
        )
    }
}
