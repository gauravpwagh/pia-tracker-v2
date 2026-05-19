package `in`.gov.ir.pia.workflow

/**
 * The requested action code is not a valid transition from the current state.
 * Maps to HTTP 422 Unprocessable Entity.
 */
class WorkflowTransitionNotAllowedException(
    message: String,
) : RuntimeException(message)

/**
 * The actor does not hold the role required by the transition.
 * Maps to HTTP 403 Forbidden.
 */
class InsufficientRoleException(
    message: String,
) : RuntimeException(message)

/**
 * The transition requires a comment but none was provided.
 * Maps to HTTP 422 Unprocessable Entity.
 */
class MissingCommentException(
    message: String,
) : RuntimeException(message)
