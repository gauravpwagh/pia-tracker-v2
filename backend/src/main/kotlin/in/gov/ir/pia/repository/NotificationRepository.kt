package `in`.gov.ir.pia.repository

import `in`.gov.ir.pia.domain.notification.Notification
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import java.util.UUID

interface NotificationRepository : JpaRepository<Notification, UUID> {

    /** Latest N notifications for a user (read + unread), newest first. */
    fun findByRecipientUserIdOrderByCreatedAtDesc(
        recipientUserId: UUID,
        pageable: Pageable,
    ): List<Notification>

    /** Unread count for bell badge. */
    fun countByRecipientUserIdAndIsReadFalse(recipientUserId: UUID): Long

    /** Mark a single notification read. */
    @Modifying
    @Query(
        """
        UPDATE Notification n
        SET n.isRead = true, n.readAt = CURRENT_TIMESTAMP
        WHERE n.id = :id AND n.recipientUserId = :userId AND n.isRead = false
        """,
    )
    fun markRead(
        @Param("id") id: UUID,
        @Param("userId") userId: UUID,
    ): Int

    /** Mark all unread notifications read for a user. */
    @Modifying
    @Query(
        """
        UPDATE Notification n
        SET n.isRead = true, n.readAt = CURRENT_TIMESTAMP
        WHERE n.recipientUserId = :userId AND n.isRead = false
        """,
    )
    fun markAllRead(@Param("userId") userId: UUID): Int
}
