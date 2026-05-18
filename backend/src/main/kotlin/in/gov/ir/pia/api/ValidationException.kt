package `in`.gov.ir.pia.api

/**
 * Thrown when submitted form data fails JSON Schema or cross-field validation.
 *
 * [ApiExceptionHandler] maps this to HTTP 422 Unprocessable Entity with a
 * structured error body containing [errors].
 */
class ValidationException(
    val errors: List<String>,
) : RuntimeException("Validation failed: ${errors.joinToString("; ")}")
