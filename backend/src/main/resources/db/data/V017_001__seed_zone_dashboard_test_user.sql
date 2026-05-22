-- V017_001__seed_zone_dashboard_test_user.sql
-- Phase 2.8: Cross-zone CAO/C test user for the zone-dashboard gate test.
--
-- User 112 (EMP012) is a CAO/C whose primary zone is SCR (South Central Railway)
-- but who also holds an active cross-zone assignment to NR (Northern Railway).
-- The zone-dashboard gate test uses this user to verify that
-- GET /api/v1/dashboard/zone returns summaries for BOTH accessible zones.
--
-- The user_zone_assignments grant is made by user 106 (Admin system user,
-- seeded in V001_004).
-- UUIDs are fixed so the integration test can reference them by ID.

INSERT INTO users (id, employee_id, name, email, designation_code, primary_zone_id, is_active, is_system_user)
VALUES (
    '11111111-1111-1111-1111-111111111112',
    'EMP012',
    'Kavitha Subramanian',
    'kavitha.subramanian@scr.railnet.gov.in',
    'CAO_C',
    (SELECT id FROM zones WHERE code = 'SCR'),
    true,
    false
);

INSERT INTO user_zone_assignments (user_id, zone_id, granted_by_user_id, reason)
VALUES (
    '11111111-1111-1111-1111-111111111112',
    (SELECT id FROM zones WHERE code = 'NR'),
    '11111111-1111-1111-1111-111111111106',
    'Cross-zone NR grant for zone-dashboard gate test'
);
