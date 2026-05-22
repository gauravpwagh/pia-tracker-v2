-- V020__sla_breach_on_activity_summary.sql
-- Phase 2.11: Add sla_breach_count to project_activity_summary.
--
-- Populated by SummaryUpdater.onWorkflowStateChanged via a live count of
-- breached workflow instances for each (project_id, activity_type_code) pair.
-- A workflow instance is breached when:
--   now() - entered_state_at > workflow_states.sla_days * 86400 seconds
--   AND the current state is non-terminal and has sla_days IS NOT NULL.
--
-- The column defaults to 0 and is kept accurate at the time of each
-- workflow transition — not a real-time running count.  The inbox query
-- in WorkflowController performs a separate live computation.
--
-- Cascade: project_summary.sla_breach_count is also updated by
-- SummaryUpdater.onProjectSummaryChanged (it was previously hardcoded to 0).

ALTER TABLE project_activity_summary
    ADD COLUMN sla_breach_count integer not null default 0;
