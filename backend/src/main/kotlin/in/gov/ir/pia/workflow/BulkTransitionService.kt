package `in`.gov.ir.pia.workflow

import `in`.gov.ir.pia.repository.WorkflowInstanceRepository
import `in`.gov.ir.pia.security.Principal
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

// ── DTOs ─────────────────────────────────────────────────────────────────────

data class BulkTransitionRequest(
    /** IDs of the activity records to transition. Max 50 per request. */
    val recordIds: List<UUID>,
    /**
     * Workflow action code — must match a valid transition from the record's
     * current state. Case-insensitive; normalised to lowercase before dispatch.
     * Example: "authenticate", "verify", "send_back".
     */
    val action: String,
    /** Optional comment. Required if the target transition requires one (e.g., send_back). */
    val comment: String? = null,
)

data class BulkTransitionItemResult(
    val recordId: UUID,
    /** true if the transition succeeded for this record. */
    val success: Boolean,
    /** Null on success; failure reason on error (max 256 chars). */
    val error: String?,
)

data class BulkTransitionResponse(
    val total: Int,
    val succeeded: Int,
    val failed: Int,
    val results: List<BulkTransitionItemResult>,
)

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * Applies a single workflow action to a batch of activity records.
 *
 * Each record is transitioned independently — a failure on one record does NOT
 * roll back successful transitions on earlier records.  The entire batch runs
 * in a single `@Transactional` boundary; if you need per-record isolation,
 * wrap individual calls.
 *
 * Permission check at the controller level (`ACTIVITY_RECORD.BULK_TRANSITION`).
 * Role check at the workflow engine level per-record (WorkflowServiceImpl checks
 * transition.roleRequiredCode against actor.roleCodes).
 *
 * Max 50 records per call to prevent accidental runaway commits.
 */
@Service
@Transactional
class BulkTransitionService(
    private val workflowService: WorkflowService,
    private val instanceRepository: WorkflowInstanceRepository,
) {
    private val log = LoggerFactory.getLogger(BulkTransitionService::class.java)

    companion object {
        const val MAX_RECORDS = 50
    }

    fun bulkTransition(
        request: BulkTransitionRequest,
        actor: Principal,
    ): BulkTransitionResponse {
        require(request.recordIds.isNotEmpty()) { "recordIds must not be empty" }
        require(request.recordIds.size <= MAX_RECORDS) {
            "Bulk transition is limited to $MAX_RECORDS records per call (got ${request.recordIds.size})"
        }

        val actionCode = request.action.lowercase()

        val results = request.recordIds.map { recordId ->
            try {
                val instance = instanceRepository.findByEntityTypeAndEntityIdNoSection(
                    "ACTIVITY_RECORD",
                    recordId,
                ) ?: return@map BulkTransitionItemResult(
                    recordId = recordId,
                    success = false,
                    error = "No record-level workflow instance found for record $recordId",
                )

                workflowService.transition(
                    instanceId = instance.id,
                    actionCode = actionCode,
                    actor = actor,
                    comment = request.comment,
                )

                BulkTransitionItemResult(recordId = recordId, success = true, error = null)
            } catch (ex: Exception) {
                log.debug("Bulk transition failed for record {}: {}", recordId, ex.message)
                BulkTransitionItemResult(
                    recordId = recordId,
                    success = false,
                    error = ex.message?.take(256) ?: "Unknown error",
                )
            }
        }

        val succeeded = results.count { it.success }
        val failed = results.size - succeeded
        log.info(
            "Bulk transition action='{}' total={} succeeded={} failed={} actor={}",
            actionCode, results.size, succeeded, failed, actor.userId,
        )

        return BulkTransitionResponse(
            total = results.size,
            succeeded = succeeded,
            failed = failed,
            results = results,
        )
    }
}
