package `in`.gov.ir.pia.domain.notification

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

/**
 * A single in-app notification delivered to one recipient.
 *
 * Schema: V009__notifications.sql.
 *
 * Fan-out (one row per recipient) happens in [WorkflowNotificationListener].
 * No [org.hibernate.annotations.SQLRestriction] — all rows are visible;
 * filtering by [isRead] happens at the query layer.
 *
 * No `@Version` — notifications are not updated concurrently; only markRead
 * flips [isRead] which is idempotent.
 */
@Entity
@Table(name = "notifications")
class Notification(
    @Id
    val id: UUID = UUID.randomUUID(),
    @Column(name = "recipient_user_id", nullable = false)
    val recipientUserId: UUID,
    /** Coarse category: WORKFLOW_ACTION | MENTION | SYSTEM */
    @Column(name = "notification_type", nullable = false, length = 32)
    val notificationType: String,
    @Column(name = "title", nullable = false, length = 256)
    val title: String,
    @Column(name = "body", nullable = false, columnDefinition = "text")
    val body: String,
    @Column(name = "entity_type", length = 32)
    val entityType: String? = null,
    @Column(name = "entity_id")
    val entityId: UUID? = null,
    /** Pre-computed frontend deep-link, e.g. "/records/{id}/edit". */
    @Column(name = "link_url", length = 512)
    val linkUrl: String? = null,
    @Column(name = "is_read", nullable = false)
    var isRead: Boolean = false,
    @Column(name = "read_at")
    var readAt: Instant? = null,
    @Column(name = "created_at", nullable = false, updatable = false)
    val createdAt: Instant = Instant.now(),
) {
    override fun equals(other: Any?): Boolean = other is Notification && id == other.id

    override fun hashCode(): Int = id.hashCode()
}
