package `in`.gov.ir.pia.notification

import `in`.gov.ir.pia.repository.ActivityRecordRepository
import `in`.gov.ir.pia.repository.ProjectActivityRepository
import `in`.gov.ir.pia.repository.ProjectAssignmentRepository
import `in`.gov.ir.pia.workflow.WorkflowStateChangedEvent
import org.slf4j.LoggerFactory
import org.springframework.context.event.EventListener
import org.springframework.stereotype.Component

/**
 * Fans out in-app notifications after every workflow state transition.
 *
 * Fan-out rules:
 * - SUBMITTED   → notify the active NODAL_DY_CE_C on the project
 * - VERIFIED    → notify the active CE_C on the project
 * - AUTHENTICATED → notify the record creator (originator)
 * - SENT_BACK   → notify the record creator (originator)
 *
 * Only ACTIVITY_RECORD entities are handled; other entity types are skipped.
 *
 * Runs inside the same DB transaction as the originating write.
 */
@Component
class WorkflowNotificationListener(
    private val notificationService: NotificationService,
    private val activityRecordRepo: ActivityRecordRepository,
    private val projectActivityRepo: ProjectActivityRepository,
    private val assignmentRepo: ProjectAssignmentRepository,
) {
    private val log = LoggerFactory.getLogger(WorkflowNotificationListener::class.java)

    @EventListener
    fun onWorkflowStateChanged(event: WorkflowStateChangedEvent) {
        if (event.entityType != "ACTIVITY_RECORD") return

        val record = activityRecordRepo.findById(event.entityId).orElse(null) ?: run {
            log.warn("WorkflowNotificationListener: record {} not found", event.entityId)
            return
        }
        val activity = projectActivityRepo.findById(record.projectActivityId).orElse(null) ?: run {
            log.warn("WorkflowNotificationListener: activity {} not found", record.projectActivityId)
            return
        }
        val projectId = activity.projectId
        val linkUrl = "/records/${event.entityId}/edit"

        when (event.toStateCode) {
            "SUBMITTED_FOR_VERIFICATION" -> {
                val nodal = assignmentRepo.findActiveNodalForProject(projectId)
                if (nodal != null) {
                    notificationService.create(
                        recipientUserId = nodal.userId,
                        notificationType = "WORKFLOW_ACTION",
                        title = "Record submitted for your verification",
                        body = "A ${activity.activityTypeCode} record has been submitted and is awaiting your verification.",
                        entityType = "ACTIVITY_RECORD",
                        entityId = event.entityId,
                        linkUrl = linkUrl,
                    )
                }
            }

            "VERIFIED" -> {
                assignmentRepo
                    .findAllByProjectIdAndAssignmentRoleAndIsActiveTrue(projectId, "CE_C")
                    .forEach { ce ->
                        notificationService.create(
                            recipientUserId = ce.userId,
                            notificationType = "WORKFLOW_ACTION",
                            title = "Record verified — pending your authentication",
                            body = "A ${activity.activityTypeCode} record has been verified and is awaiting your authentication.",
                            entityType = "ACTIVITY_RECORD",
                            entityId = event.entityId,
                            linkUrl = linkUrl,
                        )
                    }
            }

            "AUTHENTICATED" -> {
                notificationService.create(
                    recipientUserId = record.createdByUserId,
                    notificationType = "WORKFLOW_ACTION",
                    title = "Your record has been authenticated",
                    body = "A ${activity.activityTypeCode} record you submitted has been authenticated successfully.",
                    entityType = "ACTIVITY_RECORD",
                    entityId = event.entityId,
                    linkUrl = linkUrl,
                )
            }

            "SENT_BACK_TO_DYCE" -> {
                notificationService.create(
                    recipientUserId = record.createdByUserId,
                    notificationType = "WORKFLOW_ACTION",
                    title = "Record sent back for correction",
                    body = "A ${activity.activityTypeCode} record you submitted has been sent back by the Nodal Dy CE/C. Please check the comments.",
                    entityType = "ACTIVITY_RECORD",
                    entityId = event.entityId,
                    linkUrl = linkUrl,
                )
            }

            "SENT_BACK_TO_NODAL" -> {
                // Find the Nodal to notify (CE sent it back to Nodal for re-verification)
                val nodal = assignmentRepo.findActiveNodalForProject(projectId)
                if (nodal != null) {
                    notificationService.create(
                        recipientUserId = nodal.userId,
                        notificationType = "WORKFLOW_ACTION",
                        title = "Record sent back for re-verification",
                        body = "A ${activity.activityTypeCode} record has been sent back by the CE/C for re-verification. Please check the comments.",
                        entityType = "ACTIVITY_RECORD",
                        entityId = event.entityId,
                        linkUrl = linkUrl,
                    )
                }
            }

            else -> { /* DRAFT and future states — no notification */ }
        }
    }
}
