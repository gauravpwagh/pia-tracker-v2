package `in`.gov.ir.pia.notification

import `in`.gov.ir.pia.domain.activity.ActivityRecord
import `in`.gov.ir.pia.domain.activity.ProjectActivity
import `in`.gov.ir.pia.repository.ActivityRecordRepository
import `in`.gov.ir.pia.repository.ProjectActivityRepository
import `in`.gov.ir.pia.repository.ProjectAssignmentRepository
import `in`.gov.ir.pia.workflow.WorkflowStateChangedEvent
import org.slf4j.LoggerFactory
import org.springframework.context.event.EventListener
import org.springframework.stereotype.Component
import java.util.UUID

/**
 * Fans out in-app notifications after every workflow state transition.
 *
 * Fan-out rules (ACTIVITY_RECORD only — other entity types are skipped):
 * - SUBMITTED_FOR_VERIFICATION → notify the active NODAL_DY_CE_C on the project
 * - VERIFIED                   → notify all active CE_C on the project
 * - AUTHENTICATED              → notify the record creator (originator)
 * - SENT_BACK_TO_DYCE          → notify the record creator (originator)
 * - SENT_BACK_TO_NODAL         → notify the active NODAL_DY_CE_C on the project
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

        val record =
            activityRecordRepo.findById(event.entityId).orElse(null) ?: run {
                log.warn("WorkflowNotificationListener: record {} not found", event.entityId)
                return
            }
        val activity =
            projectActivityRepo.findById(record.projectActivityId).orElse(null) ?: run {
                log.warn("WorkflowNotificationListener: activity {} not found", record.projectActivityId)
                return
            }
        val linkUrl = "/records/${event.entityId}/edit"

        when (event.toStateCode) {
            "SUBMITTED_FOR_VERIFICATION" -> notifySubmitted(activity, event.entityId, linkUrl)
            "VERIFIED" -> notifyVerified(activity, event.entityId, linkUrl)
            "AUTHENTICATED" -> notifyAuthenticated(record, activity, event.entityId, linkUrl)
            "SENT_BACK_TO_DYCE" -> notifySentBackToDyce(record, activity, event.entityId, linkUrl)
            "SENT_BACK_TO_NODAL" -> notifySentBackToNodal(activity, event.entityId, linkUrl)
            else -> { /* DRAFT and future states — no notification */ }
        }
    }

    private fun notifySubmitted(
        activity: ProjectActivity,
        entityId: UUID,
        linkUrl: String,
    ) {
        val nodal = assignmentRepo.findActiveNodalForProject(activity.projectId) ?: return
        notificationService.create(
            recipientUserId = nodal.userId,
            notificationType = "WORKFLOW_ACTION",
            title = "Record submitted for your verification",
            body = "A ${activity.activityTypeCode} record has been submitted and is awaiting your verification.",
            entityType = "ACTIVITY_RECORD",
            entityId = entityId,
            linkUrl = linkUrl,
        )
    }

    private fun notifyVerified(
        activity: ProjectActivity,
        entityId: UUID,
        linkUrl: String,
    ) {
        assignmentRepo
            .findAllByProjectIdAndAssignmentRoleAndIsActiveTrue(activity.projectId, "CE_C")
            .forEach { ce ->
                notificationService.create(
                    recipientUserId = ce.userId,
                    notificationType = "WORKFLOW_ACTION",
                    title = "Record verified — pending your authentication",
                    body = "A ${activity.activityTypeCode} record has been verified and is awaiting your authentication.",
                    entityType = "ACTIVITY_RECORD",
                    entityId = entityId,
                    linkUrl = linkUrl,
                )
            }
    }

    private fun notifyAuthenticated(
        record: ActivityRecord,
        activity: ProjectActivity,
        entityId: UUID,
        linkUrl: String,
    ) {
        notificationService.create(
            recipientUserId = record.createdByUserId,
            notificationType = "WORKFLOW_ACTION",
            title = "Your record has been authenticated",
            body = "A ${activity.activityTypeCode} record you submitted has been authenticated successfully.",
            entityType = "ACTIVITY_RECORD",
            entityId = entityId,
            linkUrl = linkUrl,
        )
    }

    private fun notifySentBackToDyce(
        record: ActivityRecord,
        activity: ProjectActivity,
        entityId: UUID,
        linkUrl: String,
    ) {
        val body =
            "A ${activity.activityTypeCode} record you submitted has been sent back " +
                "by the Nodal Dy CE/C. Please check the comments."
        notificationService.create(
            recipientUserId = record.createdByUserId,
            notificationType = "WORKFLOW_ACTION",
            title = "Record sent back for correction",
            body = body,
            entityType = "ACTIVITY_RECORD",
            entityId = entityId,
            linkUrl = linkUrl,
        )
    }

    private fun notifySentBackToNodal(
        activity: ProjectActivity,
        entityId: UUID,
        linkUrl: String,
    ) {
        val nodal = assignmentRepo.findActiveNodalForProject(activity.projectId) ?: return
        val body =
            "A ${activity.activityTypeCode} record has been sent back by the CE/C " +
                "for re-verification. Please check the comments."
        notificationService.create(
            recipientUserId = nodal.userId,
            notificationType = "WORKFLOW_ACTION",
            title = "Record sent back for re-verification",
            body = body,
            entityType = "ACTIVITY_RECORD",
            entityId = entityId,
            linkUrl = linkUrl,
        )
    }
}
