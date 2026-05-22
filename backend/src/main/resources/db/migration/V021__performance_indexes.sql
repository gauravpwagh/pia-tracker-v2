-- PIA Tracker — V021: Performance indexes (Phase 2.12 hardening)
--
-- Analysis of hot query paths from Phase 2.0–2.11:
--
--  1. Inbox awaiting  (WorkflowController.buildAwaitingItems)
--     • Joins: workflow_instances → workflow_states → activity_records
--               → project_activities → projects
--     • Filters: entity_type='ACTIVITY_RECORD', ws.is_terminal=false,
--                ws.role_required_code = ANY([roleCodes])
--     • Missing: index on workflow_states(role_required_code) for non-terminal lookup
--
--  2. Inbox in-progress  (WorkflowController.buildInProgressItems)
--     • Filter: ar.created_by_user_id = :userId
--     • Missing: index on activity_records(created_by_user_id)
--
--  3. Bulk transition lookup  (BulkTransitionService)
--     • Filter: entity_type='ACTIVITY_RECORD' AND entity_id=? AND section_code IS NULL
--     • Existing ix_wi_entity(entity_type, entity_id) covers entity lookup but
--       lacks section_code; a partial index is more selective for record-level instances
--
--  4. SLA breach recount  (SummaryUpdater)
--     • Subquery joins ar → pa filtered by (pa.project_id, pa.activity_type_code)
--     • Missing: composite index on project_activities(project_id, activity_type_code)
--
--  5. Audit log action queries  (CrossActivityRefinementsGateIntegrationTest, audit endpoints)
--     • Filter: action='WORKFLOW.AUTHENTICATED' AND entity_type='ACTIVITY_RECORD'
--     • Existing ix_audit_entity_at covers (entity_type, entity_id, at) but not action
--
--  6. Workflow history actor lookup  (audit endpoints, future Phase 3 history view)
--     • No index on actor_user_id — table is append-only but grows large
--
--  7. Project activities: project_id + type lookup  (SummaryUpdater SLA recount + overview)
--     • ix_pact_project(project_id) exists but not the composite with activity_type_code

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. workflow_states — role lookup for inbox awaiting
-- Covers the hash join / nested-loop from the inbox query:
--   ws.role_required_code = ANY([roleCodes]) AND ws.is_terminal = false
-- The partial predicate (is_terminal = false) keeps the index small — terminal
-- states (AUTHENTICATED) vastly outnumber non-terminal ones over time.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX ix_ws_role_nonterminal
    ON workflow_states (role_required_code, id)
    WHERE is_terminal = false AND role_required_code IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. workflow_instances — partial covering index for ACTIVITY_RECORD inbox scan
-- The inbox awaiting query always filters entity_type = 'ACTIVITY_RECORD' and
-- orders by entered_state_at.  The partial index eliminates the PROJECT rows and
-- avoids the filter heap re-check on every row.
-- Keeps ix_wi_state_age (current_state_id, entered_state_at) for cases that
-- need cross-entity-type access (e.g. project lifecycle queries).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX ix_wi_ar_state_entered
    ON workflow_instances (current_state_id, entered_state_at ASC)
    WHERE entity_type = 'ACTIVITY_RECORD';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. workflow_instances — no-section entity lookup for bulk transition
-- BulkTransitionService.findByEntityTypeAndEntityIdNoSection uses:
--   entity_type = 'ACTIVITY_RECORD' AND entity_id = ? AND section_code IS NULL
-- The partial index is far more selective than ix_wi_entity when most instances
-- for TENDER_PACKAGING / UTILITY_SHIFTING (record-level) have section_code IS NULL.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX ix_wi_entity_nosec
    ON workflow_instances (entity_type, entity_id)
    WHERE section_code IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. activity_records — created_by_user_id for in-progress inbox
-- The in-progress inbox query filters ar.created_by_user_id = :userId.
-- Without an index the planner seqscans activity_records and applies a filter.
-- At 500+ records per zone this becomes the bottleneck.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX ix_ar_created_by
    ON activity_records (created_by_user_id)
    WHERE NOT is_deleted;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. project_activities — composite for SummaryUpdater SLA recount
-- The SLA recount subquery in SummaryUpdater filters:
--   pa.project_id = ? AND pa.activity_type_code = ?
-- ix_pact_project(project_id) WHERE NOT is_deleted already exists for list queries.
-- The composite index avoids the type-code filter scan over all activities of a project.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX ix_pact_project_type
    ON project_activities (project_id, activity_type_code)
    WHERE NOT is_deleted;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. audit_log — action + entity_type for audit verification queries
-- The audit gate test and future audit-report endpoints query:
--   WHERE action = 'WORKFLOW.AUTHENTICATED' AND entity_type = 'ACTIVITY_RECORD'
--     AND entity_id IN (...)
-- ix_audit_entity_at(entity_type, entity_id, at) covers entity_id lookups but
-- is not usable when filtering by action first.  The new index serves
-- action-first lookup patterns.
-- NOTE: audit_log is a partitioned table — this index is inherited by all
-- existing and future child partitions automatically (Postgres 11+).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX ix_audit_action_entity
    ON audit_log (action, entity_type, entity_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. workflow_history — actor_user_id lookup
-- The audit endpoint and Phase 3 "my actions" timeline filter by actor_user_id.
-- workflow_history is partitioned (monthly); the index propagates to all partitions.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX ix_wh_actor
    ON workflow_history (actor_user_id);
