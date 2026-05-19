package `in`.gov.ir.pia.workflow

import com.fasterxml.jackson.databind.JsonNode
import `in`.gov.ir.pia.domain.workflow.WorkflowHistoryEntry
import `in`.gov.ir.pia.domain.workflow.WorkflowInstance
import `in`.gov.ir.pia.domain.workflow.WorkflowState
import `in`.gov.ir.pia.security.Principal
import java.util.UUID

/**
 * Application service for all workflow state changes.
 *
 * **All state changes go through this service.**  Direct writes to
 * `workflow_instances.current_state_id` are forbidden (architecture § 15).
 *
 * See `docs/workflow.md` § 2 for the full contract.
 */
interface WorkflowService {
    /**
     * Creates a new [WorkflowInstance] in the initial state of the definition
     * identified by [definitionCode] (latest active version).
     *
     * @param definitionCode workflow definition code, e.g. "RECORD_STANDARD_V1"
     * @param entityType     "PROJECT" or "ACTIVITY_RECORD"
     * @param entityId       PK of the owning entity
     * @param sectionCode    non-null for section-level instances only
     * @throws IllegalArgumentException if the definition is not found or has no
     *         initial state
     */
    fun start(
        definitionCode: String,
        entityType: String,
        entityId: UUID,
        sectionCode: String? = null,
    ): WorkflowInstance

    /**
     * Performs a state transition on [instanceId] using [actionCode].
     *
     * Steps (all in one transaction):
     * 1. Load instance + find transition for (currentState, actionCode).
     * 2. Validate actor role ([InsufficientRoleException] on failure).
     * 3. Validate comment if required ([MissingCommentException] on failure).
     * 4. Insert a [WorkflowHistoryEntry] row.
     * 5. Update [WorkflowInstance.currentState] and [WorkflowInstance.enteredStateAt].
     * 6. Update `activity_records.record_state` cache if entityType = ACTIVITY_RECORD.
     * 7. Fire [WorkflowStateChangedEvent].
     * 8. Return the updated instance.
     *
     * @throws WorkflowTransitionNotAllowedException if no transition matches
     * @throws InsufficientRoleException if actor lacks the required role
     * @throws MissingCommentException if comment is required but blank
     */
    fun transition(
        instanceId: UUID,
        actionCode: String,
        actor: Principal,
        comment: String? = null,
        observation: JsonNode? = null,
    ): WorkflowInstance

    /**
     * Returns the current [WorkflowState] for an entity, or null if no
     * instance exists.
     */
    fun currentState(
        entityType: String,
        entityId: UUID,
        sectionCode: String? = null,
    ): WorkflowState?

    /** Full history for an instance, oldest first. */
    fun history(instanceId: UUID): List<WorkflowHistoryEntry>

    /**
     * Returns true if the instance has exceeded its current state's SLA.
     * Returns false if the state has no SLA configured.
     */
    fun isSlaBreached(instanceId: UUID): Boolean

    /**
     * Returns all [WorkflowInstance]s for an entity (a record or a project).
     *
     * For section-level workflows this returns one instance per section code.
     * For record-level or project-level this returns one instance.
     */
    fun getInstances(
        entityType: String,
        entityId: UUID,
    ): List<WorkflowInstance>

    /**
     * Returns the [WorkflowInstance] for a specific entity + section, or null.
     *
     * Pass [sectionCode] = null to look up a record-level or project-level instance.
     */
    fun getInstance(
        entityType: String,
        entityId: UUID,
        sectionCode: String?,
    ): WorkflowInstance?

    /**
     * Returns the action codes that [actor] may perform on [instance] given
     * its current state.  Role-restricted transitions where the actor lacks the
     * required role are excluded.
     */
    fun availableActions(
        instance: WorkflowInstance,
        actor: Principal,
    ): List<String>
}
