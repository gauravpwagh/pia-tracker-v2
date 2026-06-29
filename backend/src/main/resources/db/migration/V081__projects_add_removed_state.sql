-- Add REMOVED lifecycle state and transitions from all active states.
-- Only SUPER_ADMIN can remove a project (role_required_code enforced by WorkflowServiceImpl;
-- super-admin bypasses the check, so this state is effectively super-admin-only).

INSERT INTO workflow_states
    (id, workflow_definition_id, code, label, is_initial, is_terminal,
     role_required_code, sla_days, sla_warning_days, display_color)
VALUES
    ('bbbbbbbb-0002-0003-0001-000000000008',
     'bbbbbbbb-0001-0001-0001-000000000003',
     'REMOVED', 'Removed',
     false, true, null, null, null, 'RED');

-- Transitions: every non-terminal state → REMOVED via 'remove' action
INSERT INTO workflow_transitions
    (id, workflow_definition_id, from_state_id, to_state_id,
     action_code, action_label, role_required_code, requires_comment, is_backward)
VALUES
    -- DRAFT → REMOVED
    ('bbbbbbbb-0003-0003-0001-000000000009',
     'bbbbbbbb-0001-0001-0001-000000000003',
     'bbbbbbbb-0002-0003-0001-000000000001',
     'bbbbbbbb-0002-0003-0001-000000000008',
     'remove', 'Remove Project',
     'ROLE_SUPER_ADMIN', true, false),

    -- AWAITING_CAO_ALLOCATION → REMOVED
    ('bbbbbbbb-0003-0003-0001-00000000000a',
     'bbbbbbbb-0001-0001-0001-000000000003',
     'bbbbbbbb-0002-0003-0001-000000000002',
     'bbbbbbbb-0002-0003-0001-000000000008',
     'remove', 'Remove Project',
     'ROLE_SUPER_ADMIN', true, false),

    -- AWAITING_CEC_ASSIGNMENT → REMOVED
    ('bbbbbbbb-0003-0003-0001-00000000000b',
     'bbbbbbbb-0001-0001-0001-000000000003',
     'bbbbbbbb-0002-0003-0001-000000000003',
     'bbbbbbbb-0002-0003-0001-000000000008',
     'remove', 'Remove Project',
     'ROLE_SUPER_ADMIN', true, false),

    -- ACTIVE → REMOVED
    ('bbbbbbbb-0003-0003-0001-00000000000c',
     'bbbbbbbb-0001-0001-0001-000000000003',
     'bbbbbbbb-0002-0003-0001-000000000004',
     'bbbbbbbb-0002-0003-0001-000000000008',
     'remove', 'Remove Project',
     'ROLE_SUPER_ADMIN', true, false),

    -- ON_HOLD → REMOVED
    ('bbbbbbbb-0003-0003-0001-00000000000d',
     'bbbbbbbb-0001-0001-0001-000000000003',
     'bbbbbbbb-0002-0003-0001-000000000005',
     'bbbbbbbb-0002-0003-0001-000000000008',
     'remove', 'Remove Project',
     'ROLE_SUPER_ADMIN', true, false);
