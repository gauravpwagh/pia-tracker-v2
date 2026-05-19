package `in`.gov.ir.pia.service.comment

import com.fasterxml.jackson.databind.node.JsonNodeFactory
import `in`.gov.ir.pia.domain.comment.Comment
import `in`.gov.ir.pia.repository.CommentRepository
import `in`.gov.ir.pia.repository.UserRepository
import `in`.gov.ir.pia.security.Principal
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import java.time.Instant
import java.util.UUID

// ── Request / Response types ───────────────────────────────────────────────────

data class CreateCommentRequest(
    val entityType: String,
    val entityId: UUID,
    val parentCommentId: UUID? = null,
    val bodyMarkdown: String,
)

data class CommentAuthorDto(
    val userId: UUID,
    val name: String,
    val designationCode: String,
)

data class CommentDto(
    val id: UUID,
    val entityType: String,
    val entityId: UUID,
    val parentCommentId: UUID? = null,
    val author: CommentAuthorDto,
    val bodyMarkdown: String,
    val workflowStateAtComment: String? = null,
    val createdAt: Instant,
    val updatedAt: Instant,
    val replies: List<CommentDto> = emptyList(),
)

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * Manages comments on polymorphic entities (ACTIVITY_RECORD, PROJECT, ACTIVITY).
 *
 * Threading policy: two levels only — top-level comments and direct replies.
 * Attempting to reply to a reply returns 422.
 */
@Service
@Transactional
class CommentService(
    private val commentRepo: CommentRepository,
    private val userRepo: UserRepository,
    private val jdbc: JdbcTemplate,
) {
    // ── List ──────────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    fun list(entityType: String, entityId: UUID): List<CommentDto> {
        val topLevel = commentRepo.findByEntityTypeAndEntityIdAndParentCommentIdIsNullOrderByCreatedAtAsc(
            entityType, entityId,
        )
        if (topLevel.isEmpty()) return emptyList()

        // Bulk-load all authors for efficiency
        val authorIds = topLevel.map { it.authorUserId }.toSet()
        val replyMap = topLevel.associate { parent ->
            parent.id to commentRepo.findByParentCommentIdOrderByCreatedAtAsc(parent.id)
        }
        val allAuthorIds = authorIds + replyMap.values.flatten().map { it.authorUserId }
        val authors = userRepo.findAllById(allAuthorIds).associateBy { it.id }

        fun Comment.toDto(replies: List<CommentDto> = emptyList()): CommentDto {
            val user = authors[authorUserId]
                ?: throw IllegalStateException("Author $authorUserId not found for comment $id")
            return CommentDto(
                id = id,
                entityType = entityType,
                entityId = entityId,
                parentCommentId = parentCommentId,
                author = CommentAuthorDto(user.id, user.name, user.designationCode),
                bodyMarkdown = bodyMarkdown,
                workflowStateAtComment = workflowStateAtComment,
                createdAt = createdAt,
                updatedAt = updatedAt,
                replies = replies,
            )
        }

        return topLevel.map { parent ->
            val replies = replyMap[parent.id]?.map { reply -> reply.toDto() } ?: emptyList()
            parent.toDto(replies = replies)
        }
    }

    // ── Create ────────────────────────────────────────────────────────────────

    fun create(
        request: CreateCommentRequest,
        actor: Principal,
        workflowStateAtComment: String? = null,
    ): CommentDto {
        if (request.bodyMarkdown.isBlank()) {
            throw ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Comment body must not be blank")
        }

        // Threading: replies can only be to top-level comments
        if (request.parentCommentId != null) {
            val parent = commentRepo.findById(request.parentCommentId).orElseThrow {
                ResponseStatusException(HttpStatus.NOT_FOUND, "Parent comment ${request.parentCommentId} not found")
            }
            if (parent.parentCommentId != null) {
                throw ResponseStatusException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "Cannot reply to a reply — maximum threading depth is 2",
                )
            }
        }

        // Extract @-mentioned user IDs from the markdown body and store as JSON array
        val mentionedUuids = extractMentionedUserIds(request.bodyMarkdown)
        val mentionedJson = JsonNodeFactory.instance.arrayNode().also { arr ->
            mentionedUuids.forEach { arr.add(it.toString()) }
        }

        val comment = commentRepo.save(
            Comment(
                entityType = request.entityType,
                entityId = request.entityId,
                parentCommentId = request.parentCommentId,
                authorUserId = actor.userId,
                bodyMarkdown = request.bodyMarkdown.trim(),
                mentionedUserIds = mentionedJson,
                workflowStateAtComment = workflowStateAtComment,
            ),
        )

        val author = userRepo.findById(actor.userId).orElseThrow {
            IllegalStateException("Actor ${actor.userId} not found in users table")
        }

        return CommentDto(
            id = comment.id,
            entityType = comment.entityType,
            entityId = comment.entityId,
            parentCommentId = comment.parentCommentId,
            author = CommentAuthorDto(author.id, author.name, author.designationCode),
            bodyMarkdown = comment.bodyMarkdown,
            workflowStateAtComment = comment.workflowStateAtComment,
            createdAt = comment.createdAt,
            updatedAt = comment.updatedAt,
        )
    }

    // ── Delete (soft) ─────────────────────────────────────────────────────────

    fun delete(commentId: UUID, actor: Principal, canDeleteAny: Boolean) {
        val comment = commentRepo.findById(commentId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Comment $commentId not found")
        }
        if (!canDeleteAny && comment.authorUserId != actor.userId) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Cannot delete another user's comment")
        }
        comment.isDeleted = true
        comment.deletedAt = Instant.now()
        comment.deletedByUserId = actor.userId
        commentRepo.save(comment)
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    /**
     * Parses `@[display name](uuid)` and plain `@word` patterns from markdown
     * to extract mentioned user IDs.  Only UUIDs that exist in the users table
     * are included; invalid / unknown mentions are silently skipped.
     */
    private fun extractMentionedUserIds(markdown: String): Set<UUID> {
        // Match @[...](uuid) style mentions
        val uuidMention = Regex("""\@\[.*?]\(([0-9a-fA-F-]{36})\)""")
        val candidates = uuidMention.findAll(markdown)
            .mapNotNull { runCatching { UUID.fromString(it.groupValues[1]) }.getOrNull() }
            .toSet()
        return candidates.filter { id ->
            jdbc.queryForObject("SELECT count(*) FROM users WHERE id = ?", Long::class.java, id)!! > 0L
        }.toSet()
    }
}
