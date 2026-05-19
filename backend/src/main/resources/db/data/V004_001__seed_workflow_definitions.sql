-- PIA Tracker — V004_001: Seed workflow definitions, states, and transitions.
--
-- Three definitions are seeded:
--   RECORD_STANDARD_V1  (applies_to: RECORD)
--   SECTION_STANDARD_V1 (applies_to: SECTION  — same topology, separate rows)
--   PROJECT_LIFECYCLE_V1 (applies_to: PROJECT)
--
-- All UUIDs are fixed for deterministic test references.
-- Definition prefix: bbbbbbbb-0001-...
-- State prefix:      bbbbbbbb-0002-{def}-...  (def 1=RECORD, 2=SECTION, 3=PROJECT)
-- Transition prefix: bbbbbbbb-0003-{def}-...

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. WORKFLOW DEFINITIONS
-- ═════════════════════════════════════════════════════════════════════════════

INSERT INTO workflow_definitions (id, code, version, label, applies_to, is_active) VALUES
    ('bbbbbbbb-0001-0001-0001-000000000001', 'RECORD_STANDARD_V1',  1, 'Standard Record Workflow v1',  'RECORD',  true),
    ('bbbbbbbb-0001-0001-0001-000000000002', 'SECTION_STANDARD_V1', 1, 'Standard Section Workflow v1', 'SECTION', true),
    ('bbbbbbbb-0001-0001-0001-000000000003', 'PROJECT_LIFECYCLE_V1',1, 'Project Lifecycle v1',         'PROJECT', true);

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. RECORD_STANDARD_V1 — states
-- ═════════════════════════════════════════════════════════════════════════════
-- State codes, roles, and SLAs per workflow.md § 4.

INSERT INTO workflow_states
    (id, workflow_definition_id, code, label, is_initial, is_terminal,
     role_required_code, sla_days, sla_warning_days, display_color)
VALUES
    ('bbbbbbbb-0002-0001-0001-000000000001',
     'bbbbbbbb-0001-0001-0001-000000000001',
     'DRAFT', 'Draft',
     true,  false, 'ROLE_DY_CE_C', null, null, 'GRAY'),

    ('bbbbbbbb-0002-0001-0001-000000000002',
     'bbbbbbbb-0001-0001-0001-000000000001',
     'SUBMITTED_FOR_VERIFICATION', 'Submitted for Verification',
     false, false, 'ROLE_NODAL_DY_CE_C', 7, 5, 'AMBER'),

    ('bbbbbbbb-0002-0001-0001-000000000003',
     'bbbbbbbb-0001-0001-0001-000000000001',
     'VERIFIED', 'Verified',
     false, false, 'ROLE_CE_C', 5, 3, 'AMBER'),

    ('bbbbbbbb-0002-0001-0001-000000000004',
     'bbbbbbbb-0001-0001-0001-000000000001',
     'AUTHENTICATED', 'Authenticated',
     false, true, null, null, null, 'GREEN'),

    ('bbbbbbbb-0002-0001-0001-000000000005',
     'bbbbbbbb-0001-0001-0001-000000000001',
     'SENT_BACK_TO_DYCE', 'Sent Back to Dy CE/C',
     false, false, 'ROLE_DY_CE_C', 3, 2, 'RED'),

    ('bbbbbbbb-0002-0001-0001-000000000006',
     'bbbbbbbb-0001-0001-0001-000000000001',
     'SENT_BACK_TO_NODAL', 'Sent Back to Nodal',
     false, false, 'ROLE_NODAL_DY_CE_C', 3, 2, 'RED');

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. RECORD_STANDARD_V1 — transitions
-- ═════════════════════════════════════════════════════════════════════════════

INSERT INTO workflow_transitions
    (id, workflow_definition_id, from_state_id, to_state_id,
     action_code, action_label, role_required_code, requires_comment, is_backward)
VALUES
    -- DRAFT → SUBMITTED
    ('bbbbbbbb-0003-0001-0001-000000000001',
     'bbbbbbbb-0001-0001-0001-000000000001',
     'bbbbbbbb-0002-0001-0001-000000000001',  -- DRAFT
     'bbbbbbbb-0002-0001-0001-000000000002',  -- SUBMITTED_FOR_VERIFICATION
     'submit', 'Submit for Verification',
     'ROLE_DY_CE_C', false, false),

    -- SUBMITTED → VERIFIED
    ('bbbbbbbb-0003-0001-0001-000000000002',
     'bbbbbbbb-0001-0001-0001-000000000001',
     'bbbbbbbb-0002-0001-0001-000000000002',  -- SUBMITTED_FOR_VERIFICATION
     'bbbbbbbb-0002-0001-0001-000000000003',  -- VERIFIED
     'verify', 'Verify',
     'ROLE_NODAL_DY_CE_C', false, false),

    -- SUBMITTED → SENT_BACK_TO_DYCE
    ('bbbbbbbb-0003-0001-0001-000000000003',
     'bbbbbbbb-0001-0001-0001-000000000001',
     'bbbbbbbb-0002-0001-0001-000000000002',  -- SUBMITTED_FOR_VERIFICATION
     'bbbbbbbb-0002-0001-0001-000000000005',  -- SENT_BACK_TO_DYCE
     'send_back', 'Send Back to Dy CE/C',
     'ROLE_NODAL_DY_CE_C', true, true),

    -- SENT_BACK_TO_DYCE → SUBMITTED
    ('bbbbbbbb-0003-0001-0001-000000000004',
     'bbbbbbbb-0001-0001-0001-000000000001',
     'bbbbbbbb-0002-0001-0001-000000000005',  -- SENT_BACK_TO_DYCE
     'bbbbbbbb-0002-0001-0001-000000000002',  -- SUBMITTED_FOR_VERIFICATION
     'resubmit', 'Resubmit',
     'ROLE_DY_CE_C', false, false),

    -- VERIFIED → AUTHENTICATED
    ('bbbbbbbb-0003-0001-0001-000000000005',
     'bbbbbbbb-0001-0001-0001-000000000001',
     'bbbbbbbb-0002-0001-0001-000000000003',  -- VERIFIED
     'bbbbbbbb-0002-0001-0001-000000000004',  -- AUTHENTICATED
     'authenticate', 'Authenticate',
     'ROLE_CE_C', false, false),

    -- VERIFIED → SENT_BACK_TO_NODAL
    ('bbbbbbbb-0003-0001-0001-000000000006',
     'bbbbbbbb-0001-0001-0001-000000000001',
     'bbbbbbbb-0002-0001-0001-000000000003',  -- VERIFIED
     'bbbbbbbb-0002-0001-0001-000000000006',  -- SENT_BACK_TO_NODAL
     'send_back', 'Send Back to Nodal',
     'ROLE_CE_C', true, true),

    -- SENT_BACK_TO_NODAL → VERIFIED
    ('bbbbbbbb-0003-0001-0001-000000000007',
     'bbbbbbbb-0001-0001-0001-000000000001',
     'bbbbbbbb-0002-0001-0001-000000000006',  -- SENT_BACK_TO_NODAL
     'bbbbbbbb-0002-0001-0001-000000000003',  -- VERIFIED
     're_verify', 'Re-verify',
     'ROLE_NODAL_DY_CE_C', false, false);

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. SECTION_STANDARD_V1 — states (mirror of RECORD_STANDARD_V1)
-- ═════════════════════════════════════════════════════════════════════════════

INSERT INTO workflow_states
    (id, workflow_definition_id, code, label, is_initial, is_terminal,
     role_required_code, sla_days, sla_warning_days, display_color)
VALUES
    ('bbbbbbbb-0002-0002-0001-000000000001',
     'bbbbbbbb-0001-0001-0001-000000000002',
     'DRAFT', 'Draft',
     true, false, 'ROLE_DY_CE_C', null, null, 'GRAY'),

    ('bbbbbbbb-0002-0002-0001-000000000002',
     'bbbbbbbb-0001-0001-0001-000000000002',
     'SUBMITTED_FOR_VERIFICATION', 'Submitted for Verification',
     false, false, 'ROLE_NODAL_DY_CE_C', 7, 5, 'AMBER'),

    ('bbbbbbbb-0002-0002-0001-000000000003',
     'bbbbbbbb-0001-0001-0001-000000000002',
     'VERIFIED', 'Verified',
     false, false, 'ROLE_CE_C', 5, 3, 'AMBER'),

    ('bbbbbbbb-0002-0002-0001-000000000004',
     'bbbbbbbb-0001-0001-0001-000000000002',
     'AUTHENTICATED', 'Authenticated',
     false, true, null, null, null, 'GREEN'),

    ('bbbbbbbb-0002-0002-0001-000000000005',
     'bbbbbbbb-0001-0001-0001-000000000002',
     'SENT_BACK_TO_DYCE', 'Sent Back to Dy CE/C',
     false, false, 'ROLE_DY_CE_C', 3, 2, 'RED'),

    ('bbbbbbbb-0002-0002-0001-000000000006',
     'bbbbbbbb-0001-0001-0001-000000000002',
     'SENT_BACK_TO_NODAL', 'Sent Back to Nodal',
     false, false, 'ROLE_NODAL_DY_CE_C', 3, 2, 'RED');

-- ═════════════════════════════════════════════════════════════════════════════
-- 5. SECTION_STANDARD_V1 — transitions (mirror of RECORD_STANDARD_V1)
-- ═════════════════════════════════════════════════════════════════════════════

INSERT INTO workflow_transitions
    (id, workflow_definition_id, from_state_id, to_state_id,
     action_code, action_label, role_required_code, requires_comment, is_backward)
VALUES
    ('bbbbbbbb-0003-0002-0001-000000000001',
     'bbbbbbbb-0001-0001-0001-000000000002',
     'bbbbbbbb-0002-0002-0001-000000000001',
     'bbbbbbbb-0002-0002-0001-000000000002',
     'submit', 'Submit for Verification',
     'ROLE_DY_CE_C', false, false),

    ('bbbbbbbb-0003-0002-0001-000000000002',
     'bbbbbbbb-0001-0001-0001-000000000002',
     'bbbbbbbb-0002-0002-0001-000000000002',
     'bbbbbbbb-0002-0002-0001-000000000003',
     'verify', 'Verify',
     'ROLE_NODAL_DY_CE_C', false, false),

    ('bbbbbbbb-0003-0002-0001-000000000003',
     'bbbbbbbb-0001-0001-0001-000000000002',
     'bbbbbbbb-0002-0002-0001-000000000002',
     'bbbbbbbb-0002-0002-0001-000000000005',
     'send_back', 'Send Back to Dy CE/C',
     'ROLE_NODAL_DY_CE_C', true, true),

    ('bbbbbbbb-0003-0002-0001-000000000004',
     'bbbbbbbb-0001-0001-0001-000000000002',
     'bbbbbbbb-0002-0002-0001-000000000005',
     'bbbbbbbb-0002-0002-0001-000000000002',
     'resubmit', 'Resubmit',
     'ROLE_DY_CE_C', false, false),

    ('bbbbbbbb-0003-0002-0001-000000000005',
     'bbbbbbbb-0001-0001-0001-000000000002',
     'bbbbbbbb-0002-0002-0001-000000000003',
     'bbbbbbbb-0002-0002-0001-000000000004',
     'authenticate', 'Authenticate',
     'ROLE_CE_C', false, false),

    ('bbbbbbbb-0003-0002-0001-000000000006',
     'bbbbbbbb-0001-0001-0001-000000000002',
     'bbbbbbbb-0002-0002-0001-000000000003',
     'bbbbbbbb-0002-0002-0001-000000000006',
     'send_back', 'Send Back to Nodal',
     'ROLE_CE_C', true, true),

    ('bbbbbbbb-0003-0002-0001-000000000007',
     'bbbbbbbb-0001-0001-0001-000000000002',
     'bbbbbbbb-0002-0002-0001-000000000006',
     'bbbbbbbb-0002-0002-0001-000000000003',
     're_verify', 'Re-verify',
     'ROLE_NODAL_DY_CE_C', false, false);

-- ═════════════════════════════════════════════════════════════════════════════
-- 6. PROJECT_LIFECYCLE_V1 — states
-- ═════════════════════════════════════════════════════════════════════════════

INSERT INTO workflow_states
    (id, workflow_definition_id, code, label, is_initial, is_terminal,
     role_required_code, sla_days, sla_warning_days, display_color)
VALUES
    ('bbbbbbbb-0002-0003-0001-000000000001',
     'bbbbbbbb-0001-0001-0001-000000000003',
     'DRAFT', 'Draft',
     true, false, 'ROLE_EDGS_CI', null, null, 'GRAY'),

    ('bbbbbbbb-0002-0003-0001-000000000002',
     'bbbbbbbb-0001-0001-0001-000000000003',
     'AWAITING_CAO_ALLOCATION', 'Awaiting CAO/C Allocation',
     false, false, 'ROLE_CAO_C', 14, 10, 'AMBER'),

    ('bbbbbbbb-0002-0003-0001-000000000003',
     'bbbbbbbb-0001-0001-0001-000000000003',
     'AWAITING_CEC_ASSIGNMENT', 'Awaiting CE/C Assignment',
     false, false, 'ROLE_CE_C', 7, 5, 'AMBER'),

    ('bbbbbbbb-0002-0003-0001-000000000004',
     'bbbbbbbb-0001-0001-0001-000000000003',
     'ACTIVE', 'Active',
     false, false, null, null, null, 'GREEN'),

    ('bbbbbbbb-0002-0003-0001-000000000005',
     'bbbbbbbb-0001-0001-0001-000000000003',
     'ON_HOLD', 'On Hold',
     false, false, null, null, null, 'AMBER'),

    ('bbbbbbbb-0002-0003-0001-000000000006',
     'bbbbbbbb-0001-0001-0001-000000000003',
     'COMPLETED', 'Completed',
     false, true, null, null, null, 'GREEN'),

    ('bbbbbbbb-0002-0003-0001-000000000007',
     'bbbbbbbb-0001-0001-0001-000000000003',
     'DROPPED', 'Dropped',
     false, true, null, null, null, 'GRAY');

-- ═════════════════════════════════════════════════════════════════════════════
-- 7. PROJECT_LIFECYCLE_V1 — transitions
-- ═════════════════════════════════════════════════════════════════════════════

INSERT INTO workflow_transitions
    (id, workflow_definition_id, from_state_id, to_state_id,
     action_code, action_label, role_required_code, requires_comment, is_backward)
VALUES
    -- DRAFT → AWAITING_CAO_ALLOCATION
    ('bbbbbbbb-0003-0003-0001-000000000001',
     'bbbbbbbb-0001-0001-0001-000000000003',
     'bbbbbbbb-0002-0003-0001-000000000001',
     'bbbbbbbb-0002-0003-0001-000000000002',
     'submit', 'Submit for Allocation',
     'ROLE_EDGS_CI', false, false),

    -- AWAITING_CAO_ALLOCATION → AWAITING_CEC_ASSIGNMENT
    ('bbbbbbbb-0003-0003-0001-000000000002',
     'bbbbbbbb-0001-0001-0001-000000000003',
     'bbbbbbbb-0002-0003-0001-000000000002',
     'bbbbbbbb-0002-0003-0001-000000000003',
     'allocate', 'Allocate to CE/C',
     'ROLE_CAO_C', false, false),

    -- AWAITING_CEC_ASSIGNMENT → ACTIVE
    ('bbbbbbbb-0003-0003-0001-000000000003',
     'bbbbbbbb-0001-0001-0001-000000000003',
     'bbbbbbbb-0002-0003-0001-000000000003',
     'bbbbbbbb-0002-0003-0001-000000000004',
     'assign_dyces', 'Assign Dy CE/Cs',
     'ROLE_CE_C', false, false),

    -- ACTIVE → ON_HOLD
    ('bbbbbbbb-0003-0003-0001-000000000004',
     'bbbbbbbb-0001-0001-0001-000000000003',
     'bbbbbbbb-0002-0003-0001-000000000004',
     'bbbbbbbb-0002-0003-0001-000000000005',
     'hold', 'Put on Hold',
     'ROLE_CE_C', true, true),

    -- ON_HOLD → ACTIVE
    ('bbbbbbbb-0003-0003-0001-000000000005',
     'bbbbbbbb-0001-0001-0001-000000000003',
     'bbbbbbbb-0002-0003-0001-000000000005',
     'bbbbbbbb-0002-0003-0001-000000000004',
     'resume', 'Resume',
     'ROLE_CE_C', true, false),

    -- ACTIVE → COMPLETED
    ('bbbbbbbb-0003-0003-0001-000000000006',
     'bbbbbbbb-0001-0001-0001-000000000003',
     'bbbbbbbb-0002-0003-0001-000000000004',
     'bbbbbbbb-0002-0003-0001-000000000006',
     'complete', 'Mark Complete',
     'ROLE_CE_C', true, false),

    -- ACTIVE → DROPPED
    ('bbbbbbbb-0003-0003-0001-000000000007',
     'bbbbbbbb-0001-0001-0001-000000000003',
     'bbbbbbbb-0002-0003-0001-000000000004',
     'bbbbbbbb-0002-0003-0001-000000000007',
     'drop', 'Drop Project',
     'ROLE_EDGS_CI', true, false),

    -- DRAFT → DROPPED
    ('bbbbbbbb-0003-0003-0001-000000000008',
     'bbbbbbbb-0001-0001-0001-000000000003',
     'bbbbbbbb-0002-0003-0001-000000000001',
     'bbbbbbbb-0002-0003-0001-000000000007',
     'drop', 'Drop Project',
     'ROLE_EDGS_CI', true, false);
