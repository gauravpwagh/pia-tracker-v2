package `in`.gov.ir.pia.export

import java.util.UUID

/**
 * Published (inside the creating transaction) when a new export job is persisted.
 * [ExportJobProcessor] listens with @TransactionalEventListener(AFTER_COMMIT) so
 * it only fires after the job row is visible to other transactions.
 */
data class ExportJobCreatedEvent(
    val jobId: UUID,
)
