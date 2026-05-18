package `in`.gov.ir.pia.api

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
 *   [ValidationException]     → 422 Unprocessable Entity + structured error list
 *   [ResponseStatusException] → whatever status the exception carries
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
