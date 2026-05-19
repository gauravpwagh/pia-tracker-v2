package `in`.gov.ir.pia.workflow

import com.fasterxml.jackson.databind.JsonNode
import `in`.gov.ir.pia.domain.workflow.WorkflowHistoryEntry
import `in`.gov.ir.pia.domain.workflow.WorkflowInstance
import `in`.gov.ir.pia.domain.workflow.WorkflowState
import `in`.gov.ir.pia.repository.WorkflowDefinitionRepository
import `in`.gov.ir.pia.repository.WorkflowHistoryRepository
import `in`.gov.ir.pia.repository.WorkflowInstanceRepository
import `in`.gov.ir.pia.repository.WorkflowStateRepository
import `in`.gov.ir.pia.repository.WorkflowTransitionRepository
import `in`.gov.ir.pia.security.Principal
import org.springframework.context.ApplicationEventPublisher
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import java.time.Instant
import java.util.UUID

/**
 * Default [WorkflowService] implementation.
 *
 * Every public method is transactional.  History writes, instance updates, and
 * the cache update all happen in the same DB transaction; if any step fails the
 * whole transition rolls back.
 */
@Service
@Transactional
class WorkflowServiceImpl(
    private val definitionRepo: WorkflowDefinitionRepository,
    private val stateRepo: WorkflowStateRepository,
    private val transitionRepo: WorkflowTransitionRepository,
    private val instanceRepo: WorkflowInstanceRepository,
    private val historyRepo: WorkflowHistoryRepository,
    private val eventPublisher: ApplicationEventPublisher,
    private val jdbc: JdbcTemplate,
) : WorkflowService {
    // ── start ────────────────────────────────────────────────────────────────

    override fun start(
        definitionCode: String,
        entityType: String,
        entityId: UUID,
        sectionCode: String?,
    ): WorkflowInstance {
        val definition =
            definitionRepo.findTopByCodeAndIsActiveTrueOrderByVersionDesc(definitionCode)
                ?: throw ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "WorkflowDefinition '$definitionCode' not found",
                )

        val initialState =
            stateRepo.findByWorkflowDefinitionIdAndIsInitialTrue(definition.id)
                ?: throw IllegalStateException(
                    "No initial state configured for workflow '$definitionCode'",
                )

        val instance =
            WorkflowInstance(
                workflowDefinition = definition,
                entityType = entityType,
                entityId = entityId,
                sectionCode = sectionCode,
                currentState = initialState,
            )

        return instanceRepo.save(instance)
    }

    // ── transition ───────────────────────────────────────────────────────────

    override fun transition(
        instanceId: UUID,
        actionCode: String,
        actor: Principal,
        comment: String?,
        observation: JsonNode?,
    ): WorkflowInstance {
        val instance =
            instanceRepo.findById(instanceId).orElseThrow {
                ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "WorkflowInstance '$instanceId' not found",
                )
            }

        // 1. Find matching transition from the current state
        val transition =
            transitionRepo.findByFromStateIdAndActionCode(instance.currentState.id, actionCode)
                ?: throw WorkflowTransitionNotAllowedException(
                    "Action '$actionCode' is not a valid transition from state " +
                        "'${instance.currentState.code}' on instance $instanceId",
                )

        // 2. Role check — super-admin bypasses
        transition.roleRequiredCode?.let { required ->
            if (!actor.isSuperAdmin && !actor.roleCodes.contains(required)) {
                throw InsufficientRoleException(
                    "Role '$required' is required to perform action '$actionCode' " +
                        "(actor has: ${actor.roleCodes})",
                )
            }
        }

        // 3. Comment check
        if (transition.requiresComment && comment.isNullOrBlank()) {
            throw MissingCommentException(
                "A comment is required for action '$actionCode'",
            )
        }

        val previousState = instance.currentState

        // 4. Insert history row
        historyRepo.save(
            WorkflowHistoryEntry(
                workflowInstance = instance,
                fromState = previousState,
                toState = transition.toState,
                transition = transition,
                actorUserId = actor.userId,
                comment = comment?.takeIf { it.isNotBlank() },
                observationJson = observation,
            ),
        )

        // 5. Advance the instance
        instance.currentState = transition.toState
        instance.enteredStateAt = Instant.now()
        instance.lastActorUserId = actor.userId
        instance.sentBackMarker = transition.isBackward
        val saved = instanceRepo.save(instance)

        // 6. Update activity_records.record_state cache
        if (instance.entityType == "ACTIVITY_RECORD") {
            jdbc.update(
                "UPDATE activity_records SET record_state = ? WHERE id = ?",
                transition.toState.code,
                instance.entityId,
            )
        }

        // 7. Publish domain event
        eventPublisher.publishEvent(
            WorkflowStateChangedEvent(
                instanceId = instance.id,
                entityType = instance.entityType,
                entityId = instance.entityId,
                sectionCode = instance.sectionCode,
                fromStateCode = previousState.code,
                toStateCode = transition.toState.code,
                actor = actor,
            ),
        )

        return saved
    }

    // ── currentState ─────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    override fun currentState(
        entityType: String,
        entityId: UUID,
        sectionCode: String?,
    ): WorkflowState? {
        val instance =
            if (sectionCode == null) {
                instanceRepo.findByEntityTypeAndEntityIdNoSection(entityType, entityId)
            } else {
                instanceRepo.findByEntityTypeAndEntityIdAndSectionCode(entityType, entityId, sectionCode)
            }
        return instance?.currentState
    }

    // ── history ──────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    override fun history(instanceId: UUID): List<WorkflowHistoryEntry> = historyRepo.findByWorkflowInstanceIdOrderByAtAsc(instanceId)

    // ── isSlaBreached ────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    override fun isSlaBreached(instanceId: UUID): Boolean {
        val instance =
            instanceRepo.findById(instanceId).orElseThrow {
                ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "WorkflowInstance '$instanceId' not found",
                )
            }
        val slaDays = instance.currentState.slaDays ?: return false
        val ageHours =
            java.time.Duration
                .between(instance.enteredStateAt, Instant.now())
                .toHours()
        return ageHours > slaDays * 24L
    }
}
