package `in`.gov.ir.pia.domain.comment

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.node.JsonNodeFactory
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import jakarta.persistence.Version
import org.hibernate.annotations.JdbcTypeCode
import org.hibernate.annotations.SQLRestriction
import org.hibernate.type.SqlTypes
import java.time.Instant
import java.util.UUID

/**
 * A user-authored comment on a polymorphic entity (ACTIVITY_RECORD, PROJECT, ACTIVITY).
 *
 * Schema: V008__comments.sql.
 *
 * Threading: two levels only — top-level comments and direct replies.
 * Deeper nesting is blocked at the service layer.
 *
 * Soft-deleted rows are hidden from default repository queries via
 * [SQLRestriction]. Admin hard-delete is out of scope for Phase 1.
 */
@Entity
@Table(name = "comments")
@SQLRestriction("is_deleted = false")
class Comment(
    @Id
    val id: UUID = UUID.randomUUID(),
    @Column(name = "entity_type", nullable = false, length = 32)
    val entityType: String,
    @Column(name = "entity_id", nullable = false)
    val entityId: UUID,
    @Column(name = "parent_comment_id")
    val parentCommentId: UUID? = null,
    @Column(name = "author_user_id", nullable = false)
    val authorUserId: UUID,
    @Column(name = "body_markdown", nullable = false, columnDefinition = "text")
    var bodyMarkdown: String,
    /**
     * JSON array of UUID strings for @-mentioned users; used for notification
     * fan-out in Phase 1.14.  Stored as `jsonb` for portability.
     * Example: `["uuid1", "uuid2"]`
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "mentioned_user_ids", nullable = false, columnDefinition = "jsonb")
    var mentionedUserIds: JsonNode = JsonNodeFactory.instance.arrayNode(),
    /** Snapshot of the workflow state code at time of posting (for timeline context). */
    @Column(name = "workflow_state_at_comment", length = 64)
    val workflowStateAtComment: String? = null,
    @Column(name = "created_at", nullable = false, updatable = false)
    val createdAt: Instant = Instant.now(),
    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now(),
    @Column(name = "is_deleted", nullable = false)
    var isDeleted: Boolean = false,
    @Column(name = "deleted_at")
    var deletedAt: Instant? = null,
    @Column(name = "deleted_by_user_id")
    var deletedByUserId: UUID? = null,
    @Version
    val version: Int = 0,
) {
    override fun equals(other: Any?): Boolean = other is Comment && id == other.id

    override fun hashCode(): Int = id.hashCode()
}
