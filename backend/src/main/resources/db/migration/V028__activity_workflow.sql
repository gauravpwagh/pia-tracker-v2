-- V028: Activity-level workflow definition (ACTIVITY_STANDARD_V1).
--
-- Activities have their own submit → verify → authenticate lifecycle,
-- independent of individual record-level workflows.  This allows activities
-- with no records (e.g. activity types managed purely through metadata) to
-- still be submitted and authenticated.
--
-- State machine mirrors RECORD_STANDARD_V1 (same codes, different definition).
-- entity_type used in workflow_instances: 'PROJECT_ACTIVITY'
--
-- UUID prefixes:
--   Definition : bbbbbbbb-0001-0001-0001-000000000004
--   States     : bbbbbbbb-0002-0004-0001-00000000000X
--   Transitions: bbbbbbbb-0003-0004-0001-00000000000X

INSERT INTO workflow_definitions (id, code, version, label, applies_to, is_active) VALUES
    ('bbbbbbbb-0001-0001-0001-000000000004',
     'ACTIVITY_STANDARD_V1', 1,
     'Standard Activity Workflow v1',
     'ACTIVITY', true);

-- ── States ────────────────────────────────────────────────────────────────────

INSERT INTO workflow_states
    (id, workflow_definition_id, code, label, is_initial, is_terminal,
     role_required_code, sla_days, sla_warning_days, display_color)
VALUES
    ('bbbbbbbb-0002-0004-0001-000000000001',
     'bbbbbbbb-0001-0001-0001-000000000004',
     'DRAFT', 'Draft',
     true, false, 'ROLE_DY_CE_C', null, null, 'GRAY'),

    ('bbbbbbbb-0002-0004-0001-000000000002',
     'bbbbbbbb-0001-0001-0001-000000000004',
     'SUBMITTED_FOR_VERIFICATION', 'Submitted for Verification',
     false, false, 'ROLE_NODAL_DY_CE_C', 7, 5, 'AMBER'),

    ('bbbbbbbb-0002-0004-0001-000000000003',
     'bbbbbbbb-0001-0001-0001-000000000004',
     'VERIFIED', 'Verified',
     false, false, 'ROLE_CE_C', 5, 3, 'AMBER'),

    ('bbbbbbbb-0002-0004-0001-000000000004',
     'bbbbbbbb-0001-0001-0001-000000000004',
     'AUTHENTICATED', 'Authenticated',
     false, true, null, null, null, 'GREEN'),

    ('bbbbbbbb-0002-0004-0001-000000000005',
     'bbbbbbbb-0001-0001-0001-000000000004',
     'SENT_BACK_TO_DYCE', 'Sent Back to Dy CE/C',
     false, false, 'ROLE_DY_CE_C', 3, 2, 'RED'),

    ('bbbbbbbb-0002-0004-0001-000000000006',
     'bbbbbbbb-0001-0001-0001-000000000004',
     'SENT_BACK_TO_NODAL', 'Sent Back to Nodal',
     false, false, 'ROLE_NODAL_DY_CE_C', 3, 2, 'RED');

-- ── Transitions ───────────────────────────────────────────────────────────────

INSERT INTO workflow_transitions
    (id, workflow_definition_id, from_state_id, to_state_id,
     action_code, action_label, role_required_code, requires_comment, is_backward)
VALUES
    ('bbbbbbbb-0003-0004-0001-000000000001',
     'bbbbbbbb-0001-0001-0001-000000000004',
     'bbbbbbbb-0002-0004-0001-000000000001',
     'bbbbbbbb-0002-0004-0001-000000000002',
     'submit', 'Submit for Verification',
     'ROLE_DY_CE_C', false, false),

    ('bbbbbbbb-0003-0004-0001-000000000002',
     'bbbbbbbb-0001-0001-0001-000000000004',
     'bbbbbbbb-0002-0004-0001-000000000002',
     'bbbbbbbb-0002-0004-0001-000000000003',
     'verify', 'Submit for Authentication',
     'ROLE_NODAL_DY_CE_C', false, false),

    ('bbbbbbbb-0003-0004-0001-000000000003',
     'bbbbbbbb-0001-0001-0001-000000000004',
     'bbbbbbbb-0002-0004-0001-000000000002',
     'bbbbbbbb-0002-0004-0001-000000000005',
     'send_back', 'Send Back to Dy CE/C',
     'ROLE_NODAL_DY_CE_C', true, true),

    ('bbbbbbbb-0003-0004-0001-000000000004',
     'bbbbbbbb-0001-0001-0001-000000000004',
     'bbbbbbbb-0002-0004-0001-000000000005',
     'bbbbbbbb-0002-0004-0001-000000000002',
     'resubmit', 'Resubmit',
     'ROLE_DY_CE_C', false, false),

    ('bbbbbbbb-0003-0004-0001-000000000005',
     'bbbbbbbb-0001-0001-0001-000000000004',
     'bbbbbbbb-0002-0004-0001-000000000003',
     'bbbbbbbb-0002-0004-0001-000000000004',
     'authenticate', 'Authenticate',
     'ROLE_CE_C', false, false),

    ('bbbbbbbb-0003-0004-0001-000000000006',
     'bbbbbbbb-0001-0001-0001-000000000004',
     'bbbbbbbb-0002-0004-0001-000000000003',
     'bbbbbbbb-0002-0004-0001-000000000006',
     'send_back', 'Send Back to Nodal',
     'ROLE_CE_C', true, true),

    ('bbbbbbbb-0003-0004-0001-000000000007',
     'bbbbbbbb-0001-0001-0001-000000000004',
     'bbbbbbbb-0002-0004-0001-000000000006',
     'bbbbbbbb-0002-0004-0001-000000000003',
     're_verify', 'Re-verify',
     'ROLE_NODAL_DY_CE_C', false, false);
