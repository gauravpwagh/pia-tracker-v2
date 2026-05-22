-- V016__seed_drawing_edit_test_user.sql
-- Phase 2.7: One additional approval-role test user for the approver-edit gate.
--
-- 111: DY_CE in NR zone — approval role not in the ESP default list (which has
--      SR_DEN + DY_CEE), so the CE/C can add this user as an "unlisted" approver.
--
-- ROLE_APPROVER_GENERIC is granted automatically via designation_default_roles.
-- UUIDs are fixed so integration tests can reference them by ID.

INSERT INTO users (id, employee_id, name, email, designation_code, primary_zone_id, is_active, is_system_user)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    'EMP011',
    'Arjun Mehta',
    'arjun.mehta@nr.railnet.gov.in',
    'DY_CE',
    (SELECT id FROM zones WHERE code = 'NR'),
    true,
    false
);
