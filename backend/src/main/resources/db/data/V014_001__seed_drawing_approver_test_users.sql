-- V014_001__seed_drawing_approver_test_users.sql
-- Phase 2.5: Two users with approval-role designations for drawing-approver gate tests.
--
-- 109: SR_DEN in NR zone — approval role, will appear in drawing approver checklist
-- 110: DY_CEE in NR zone — approval role, will appear in drawing approver checklist
--
-- Both receive ROLE_APPROVER_GENERIC automatically via designation_default_roles,
-- giving them DRAWING.APPROVE and DRAWING.SEND_BACK permissions.
--
-- UUIDs are fixed so integration tests can reference them by ID.

INSERT INTO users (id, employee_id, name, email, designation_code, primary_zone_id, is_active, is_system_user)
VALUES
    (
        '11111111-1111-1111-1111-111111111109',
        'EMP009',
        'Vikram Nair',
        'vikram.nair@nr.railnet.gov.in',
        'SR_DEN',
        (SELECT id FROM zones WHERE code = 'NR'),
        true,
        false
    ),
    (
        '11111111-1111-1111-1111-111111111110',
        'EMP010',
        'Deepa Krishnamurthy',
        'deepa.krishnamurthy@nr.railnet.gov.in',
        'DY_CEE',
        (SELECT id FROM zones WHERE code = 'NR'),
        true,
        false
    );
