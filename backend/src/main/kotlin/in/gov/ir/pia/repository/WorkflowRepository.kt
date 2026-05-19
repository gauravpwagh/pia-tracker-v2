package `in`.gov.ir.pia.repository

import `in`.gov.ir.pia.domain.workflow.WorkflowDefinition
import `in`.gov.ir.pia.domain.workflow.WorkflowHistoryEntry
import `in`.gov.ir.pia.domain.workflow.WorkflowInstance
import `in`.gov.ir.pia.domain.workflow.WorkflowState
import `in`.gov.ir.pia.domain.workflow.WorkflowTransition
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import java.util.UUID

interface WorkflowDefinitionRepository : JpaRepository<WorkflowDefinition, UUID> {
    /** Latest active version for [code], or null if none exists. */
    fun findTopByCodeAndIsActiveTrueOrderByVersionDesc(code: String): WorkflowDefinition?
}

interface WorkflowStateRepository : JpaRepository<WorkflowState, UUID> {
    fun findByWorkflowDefinitionIdAndIsInitialTrue(definitionId: UUID): WorkflowState?

    fun findByWorkflowDefinitionId(definitionId: UUID): List<WorkflowState>
}

interface WorkflowTransitionRepository : JpaRepository<WorkflowTransition, UUID> {
    fun findByFromStateIdAndActionCode(
        fromStateId: UUID,
        actionCode: String,
    ): WorkflowTransition?

    fun findByFromStateId(fromStateId: UUID): List<WorkflowTransition>

    fun findByWorkflowDefinitionId(definitionId: UUID): List<WorkflowTransition>
}

interface WorkflowInstanceRepository : JpaRepository<WorkflowInstance, UUID> {
    @Query(
        """
        SELECT wi FROM WorkflowInstance wi
        WHERE wi.entityType = :entityType
          AND wi.entityId   = :entityId
          AND wi.sectionCode IS NULL
        """,
    )
    fun findByEntityTypeAndEntityIdNoSection(
        @Param("entityType") entityType: String,
        @Param("entityId") entityId: UUID,
    ): WorkflowInstance?

    @Query(
        """
        SELECT wi FROM WorkflowInstance wi
        WHERE wi.entityType  = :entityType
          AND wi.entityId    = :entityId
          AND wi.sectionCode = :sectionCode
        """,
    )
    fun findByEntityTypeAndEntityIdAndSectionCode(
        @Param("entityType") entityType: String,
        @Param("entityId") entityId: UUID,
        @Param("sectionCode") sectionCode: String,
    ): WorkflowInstance?
}

interface WorkflowHistoryRepository : JpaRepository<WorkflowHistoryEntry, UUID> {
    fun findByWorkflowInstanceIdOrderByAtAsc(instanceId: UUID): List<WorkflowHistoryEntry>
}
