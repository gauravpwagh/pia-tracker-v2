package `in`.gov.ir.pia.api

import `in`.gov.ir.pia.workflow.InsufficientRoleException
import `in`.gov.ir.pia.workflow.MissingCommentException
import `in`.gov.ir.pia.workflow.WorkflowTransitionNotAllowedException
import org.slf4j.LoggerFactory
import org.springframework.http.HttpStatus
import org.springframework.http.ProblemDetail
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.springframework.web.server.ResponseStatusException
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler

/**
 * Global REST exception handler.
 *
 * Converts application exceptions into RFC 7807 Problem Detail responses.
 * Controllers must not produce error bodies inline — all error shapes come
 * from here (see `docs/api.md` § error envelope).
 *
 * Status mapping:
 *   [ValidationException]                    → 422 Unprocessable Entity + structured error list
 *   [WorkflowTransitionNotAllowedException]  → 422 Unprocessable Entity
 *   [MissingCommentException]               → 422 Unprocessable Entity
 *   [InsufficientRoleException]             → 403 Forbidden
 *   [ResponseStatusException]               → whatever status the exception carries
 */
@RestControllerAdvice
class ApiExceptionHandler : ResponseEntityExceptionHandler() {
    private val log = LoggerFactory.getLogger(javaClass)

    /**
     * Handles JSON Schema / cross-field validation failures from
     * [FormDefinitionService.validate] and [FormService.save].
     *
     * Response body (422):
     * ```json
     * {
     *   "status": 422,
     *   "title": "Validation failed",
     *   "detail": "The submitted data does not satisfy the form schema.",
     *   "errors": ["village_name: must not be blank", "..."]
     * }
     * ```
     */
    @ExceptionHandler(ValidationException::class)
    fun handleValidation(ex: ValidationException): ProblemDetail {
        val pd = ProblemDetail.forStatus(HttpStatus.UNPROCESSABLE_ENTITY)
        pd.title = "Validation failed"
        pd.detail = "The submitted data does not satisfy the form schema."
        pd.setProperty("errors", ex.errors)
        return pd
    }

    /** The requested action code is not a valid transition from the current state (422). */
    @ExceptionHandler(WorkflowTransitionNotAllowedException::class)
    fun handleTransitionNotAllowed(ex: WorkflowTransitionNotAllowedException): ProblemDetail {
        val pd = ProblemDetail.forStatus(HttpStatus.UNPROCESSABLE_ENTITY)
        pd.title = "Transition not allowed"
        pd.detail = ex.message
        return pd
    }

    /** A comment is required for this transition but was not provided (422). */
    @ExceptionHandler(MissingCommentException::class)
    fun handleMissingComment(ex: MissingCommentException): ProblemDetail {
        val pd = ProblemDetail.forStatus(HttpStatus.UNPROCESSABLE_ENTITY)
        pd.title = "Comment required"
        pd.detail = ex.message
        return pd
    }

    /** Actor does not hold the role required by the transition (403). */
    @ExceptionHandler(InsufficientRoleException::class)
    fun handleInsufficientRole(ex: InsufficientRoleException): ProblemDetail {
        log.warn("Insufficient role: {}", ex.message)
        val pd = ProblemDetail.forStatus(HttpStatus.FORBIDDEN)
        pd.title = "Insufficient role"
        pd.detail = ex.message
        return pd
    }

    /**
     * Forwards [ResponseStatusException] details to the client.
     * Spring's default handling already does this for most cases; we override
     * here to ensure consistent Problem Detail format.
     */
    @ExceptionHandler(ResponseStatusException::class)
    fun handleResponseStatus(ex: ResponseStatusException): ProblemDetail {
        if (ex.statusCode.value() >= 500) {
            log.error("Unhandled ResponseStatusException", ex)
        }
        val pd = ProblemDetail.forStatus(ex.statusCode)
        pd.detail = ex.reason
        return pd
    }
}
