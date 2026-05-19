package `in`.gov.ir.pia.repository

import `in`.gov.ir.pia.domain.comment.Comment
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
interface CommentRepository : JpaRepository<Comment, UUID> {
    /**
     * Returns all non-deleted top-level comments (no parent) for an entity,
     * ordered by creation time ascending (oldest first → natural reading order).
     */
    fun findByEntityTypeAndEntityIdAndParentCommentIdIsNullOrderByCreatedAtAsc(
        entityType: String,
        entityId: UUID,
    ): List<Comment>

    /**
     * Returns all non-deleted replies to a given parent comment, ordered by
     * creation time ascending.
     */
    fun findByParentCommentIdOrderByCreatedAtAsc(parentCommentId: UUID): List<Comment>
}
