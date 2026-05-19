package `in`.gov.ir.pia.notification

import `in`.gov.ir.pia.domain.notification.Notification
import `in`.gov.ir.pia.repository.NotificationRepository
import org.springframework.data.domain.PageRequest
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

// ── DTOs ─────────────────────────────────────────────────────────────────────

data class NotificationDto(
    val id: UUID,
    val notificationType: String,
    val title: String,
    val body: String,
    val entityType: String?,
    val entityId: UUID?,
    val linkUrl: String?,
    val isRead: Boolean,
    val createdAt: java.time.Instant,
)

data class NotificationSummaryDto(
    val unreadCount: Long,
    val notifications: List<NotificationDto>,
)

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * Manages in-app notifications.
 *
 * Notifications are created by [WorkflowNotificationListener]; this service
 * handles reads and mark-read operations.
 */
@Service
@Transactional
class NotificationService(
    private val notificationRepo: NotificationRepository,
) {
    /**
     * Creates and persists a notification.  Called from event listeners —
     * runs inside the same transaction as the originating write.
     */
    fun create(
        recipientUserId: UUID,
        notificationType: String,
        title: String,
        body: String,
        entityType: String? = null,
        entityId: UUID? = null,
        linkUrl: String? = null,
    ): Notification =
        notificationRepo.save(
            Notification(
                recipientUserId = recipientUserId,
                notificationType = notificationType,
                title = title,
                body = body,
                entityType = entityType,
                entityId = entityId,
                linkUrl = linkUrl,
            ),
        )

    @Transactional(readOnly = true)
    fun listForUser(userId: UUID, limit: Int = 30): NotificationSummaryDto {
        val notifications =
            notificationRepo
                .findByRecipientUserIdOrderByCreatedAtDesc(userId, PageRequest.of(0, limit))
                .map { it.toDto() }
        val unreadCount = notificationRepo.countByRecipientUserIdAndIsReadFalse(userId)
        return NotificationSummaryDto(unreadCount = unreadCount, notifications = notifications)
    }

    fun markRead(id: UUID, userId: UUID) {
        val updated = notificationRepo.markRead(id, userId)
        if (updated == 0) {
            // Either not found, not owned by user, or already read — silently ignore
            notificationRepo.findById(id).orElseThrow {
                ResponseStatusException(HttpStatus.NOT_FOUND, "Notification $id not found")
            }
        }
    }

    fun markAllRead(userId: UUID) {
        notificationRepo.markAllRead(userId)
    }

    private fun Notification.toDto() =
        NotificationDto(
            id = id,
            notificationType = notificationType,
            title = title,
            body = body,
            entityType = entityType,
            entityId = entityId,
            linkUrl = linkUrl,
            isRead = isRead,
            createdAt = createdAt,
        )
}
