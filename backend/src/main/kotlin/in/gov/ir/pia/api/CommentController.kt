package `in`.gov.ir.pia.api

import `in`.gov.ir.pia.security.PiaPrincipal
import `in`.gov.ir.pia.service.comment.CommentDto
import `in`.gov.ir.pia.service.comment.CommentService
import `in`.gov.ir.pia.service.comment.CreateCommentRequest
import org.springframework.http.HttpStatus
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

/**
 * Comment CRUD endpoints.
 *
 * All comments are scoped to a polymorphic entity (`entityType` + `entityId`).
 * The client passes these as query parameters on GET and in the request body on POST.
 *
 *   GET    /api/v1/comments?entityType=ACTIVITY_RECORD&entityId={uuid}
 *   POST   /api/v1/comments
 *   DELETE /api/v1/comments/{id}
 */
@RestController
class CommentController(
    private val commentService: CommentService,
) {
    /** List top-level comments with their replies for an entity. */
    @GetMapping("/api/v1/comments")
    @PreAuthorize("isAuthenticated()")
    fun list(
        @RequestParam entityType: String,
        @RequestParam entityId: UUID,
    ): List<CommentDto> = commentService.list(entityType, entityId)

    /** Post a new comment or reply on an entity. */
    @PostMapping("/api/v1/comments")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("@pe.hasPermission(authentication, null, 'COMMENT.CREATE')")
    fun create(
        @RequestBody request: CreateCommentRequest,
        @AuthenticationPrincipal principal: PiaPrincipal,
    ): CommentDto = commentService.create(request, principal)

    /** Soft-delete a comment.  Own comments need COMMENT.DELETE.OWN; admin needs .ANY. */
    @DeleteMapping("/api/v1/comments/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize(
        "@pe.hasPermission(authentication, null, 'COMMENT.DELETE.OWN') or " +
            "@pe.hasPermission(authentication, null, 'COMMENT.DELETE.ANY')",
    )
    fun delete(
        @PathVariable id: UUID,
        @AuthenticationPrincipal principal: PiaPrincipal,
    ) {
        val canDeleteAny = principal.hasPermission("COMMENT.DELETE.ANY")
        commentService.delete(id, principal, canDeleteAny)
    }
}
