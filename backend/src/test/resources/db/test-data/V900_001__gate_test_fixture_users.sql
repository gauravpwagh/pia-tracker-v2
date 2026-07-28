-- PIA Tracker — V900_001: test-only fixture users for backend integration/gate tests.
--
-- Restores (reworked) the fixed-UUID demo users that ~30 backend integration test
-- files reference by ID, after V085_001__seed_system_users.sql deliberately removed
-- the original seed migrations (V001_004/V001_009/V001_010/V014_001/V016/V017_001,
-- plus the real HRMS bulk imports V082_002/R__93) — "the demo/test/HRMS user seeds
-- were removed on purpose" to keep fake accounts out of real deployments.
--
-- This file lives under src/test/resources, NOT src/main/resources — Gradle/Maven
-- convention means it is never on the production classpath and never packaged into
-- the application jar, so it physically cannot ship to a real environment. It's
-- loaded only via the test-specific `spring.flyway.locations` property (which adds
-- `classpath:db/test-data` alongside the real `db/migration,db/data`), not by
-- `make setup`/`make seed`/any real deployment path. Every row is also flagged
-- `is_demo = true`, matching the marking convention V082 already established.
--
-- ID scheme: `11111111-1111-1111-1111-111111111NNN`, matching what the test files
-- already hardcode — EXCEPT two ids that collided with V085_001's real system users:
--   ...101 used to be EDGS_CI here — now ADMIN (real, V085_001) — moved to ...113
--   ...102 used to be CAO_C   here — now SUPER_ADMIN (real, V085_001) — moved to ...114
-- Every occurrence of those two UUIDs was mechanically updated across the test
-- suite to match. Everything else (103–108, 112, and the SCR-block 201) is
-- unchanged from the original seed content and needed no test-file edits.
--
-- Original source, for reference: git show 379baf4^:backend/src/main/resources/db/data/V001_004__seed_demo_users.sql
-- (and V001_009, V001_010, V014_001, V016, V017_001, all at that same parent commit).
-- V014_001/V016 (drawing-approver users 109/110/111) are NOT reintroduced — no
-- current test references them; the drawing model V029 simplified to designation-only
-- slots with no per-user approvers, so those tests no longer need specific users.

INSERT INTO users (id, employee_id, name, email, designation_code, primary_zone_id,
                   is_active, is_system_user, is_demo)
VALUES
    -- Core project-hierarchy roles (was V001_004, EMP001-EMP005; ids 101/102 relocated)
    (
        '11111111-1111-1111-1111-111111111113',
        'EMP001',
        'Rajesh Kumar Singh',
        'rajesh.kumar@nr.railnet.gov.in',
        'EDGS_CI',
        (SELECT id FROM zones WHERE code = 'NR'),
        true, false, true
    ),
    (
        '11111111-1111-1111-1111-111111111114',
        'EMP002',
        'Priya Sharma',
        'priya.sharma@nr.railnet.gov.in',
        'CAO_C',
        (SELECT id FROM zones WHERE code = 'NR'),
        true, false, true
    ),
    (
        '11111111-1111-1111-1111-111111111103',
        'EMP003',
        'Amit Verma',
        'amit.verma@nr.railnet.gov.in',
        'CE_C',
        (SELECT id FROM zones WHERE code = 'NR'),
        true, false, true
    ),
    (
        '11111111-1111-1111-1111-111111111104',
        'EMP004',
        'Sunita Patel',
        'sunita.patel@nr.railnet.gov.in',
        'DY_CE_C',
        (SELECT id FROM zones WHERE code = 'NR'),
        true, false, true
    ),
    (
        '11111111-1111-1111-1111-111111111105',
        'EMP005',
        'Mohammed Asif',
        'mohammed.asif@nr.railnet.gov.in',
        'DY_CE_C',
        (SELECT id FROM zones WHERE code = 'NR'),
        true, false, true
    ),
    -- Test-fixture Admin / Super Admin (was V001_004 EMP006 / V001_010 EMP007).
    -- Emails changed from the original admin@/superadmin@pia.railnet.gov.in —
    -- those now belong to V085_001's REAL system users; UNIQUE(email) would
    -- otherwise reject these rows.
    (
        '11111111-1111-1111-1111-111111111106',
        'EMP006',
        'Admin User (test fixture)',
        'admin.testfixture@pia.railnet.gov.in',
        'ADMIN',
        null,
        true, true, true
    ),
    (
        '11111111-1111-1111-1111-111111111107',
        'EMP007',
        'Super Admin User (test fixture)',
        'superadmin.testfixture@pia.railnet.gov.in',
        'SUPER_ADMIN',
        null,
        true, true, true
    ),
    -- Cross-zone isolation fixture: Dy CE/C whose primary zone is SR, not NR
    -- (was V001_010 EMP008).
    (
        '11111111-1111-1111-1111-111111111108',
        'EMP008',
        'Lakshmi Narasimhan',
        'lakshmi.narasimhan@sr.railnet.gov.in',
        'DY_CE_C',
        (SELECT id FROM zones WHERE code = 'SR'),
        true, false, true
    ),
    -- OWN-scope fixture: a THIRD NR Dy CE/C who is never assigned to (and never
    -- Nodal on) any test project — used to verify that PROJECT.READ.OWN roles
    -- (CE/C, Dy CE/C, Nodal Dy CE/C) see only projects they're actually assigned
    -- to, not every project in their zone. Not part of the original deleted
    -- seeds — added new to cover this specific gate.
    (
        '11111111-1111-1111-1111-111111111115',
        'EMP015',
        'Ganesh Iyer',
        'ganesh.iyer@nr.railnet.gov.in',
        'DY_CE_C',
        (SELECT id FROM zones WHERE code = 'NR'),
        true, false, true
    ),
    -- Cross-zone dashboard fixture: CAO/C primary-zoned in SCR, cross-zone-granted
    -- into NR below (was V017_001 EMP012).
    (
        '11111111-1111-1111-1111-111111111112',
        'EMP012',
        'Kavitha Subramanian',
        'kavitha.subramanian@scr.railnet.gov.in',
        'CAO_C',
        (SELECT id FROM zones WHERE code = 'SCR'),
        true, false, true
    ),
    -- SCR-zone CE/C for the zone-query-filter isolation test (was V001_009,
    -- already in a separate/non-colliding UUID block — unchanged).
    (
        '22222222-2222-2222-2222-222222222201',
        'EMP201',
        'Venkatesh Rao',
        'venkatesh.rao@scr.railnet.gov.in',
        'CE_C',
        (SELECT id FROM zones WHERE code = 'SCR'),
        true, false, true
    )
ON CONFLICT (employee_id) DO NOTHING;

-- Cross-zone NR grant for user 112 (was V017_001; granted_by relocated from the
-- old ...106 Admin — same row here, so the FK still resolves within this file).
INSERT INTO user_zone_assignments (user_id, zone_id, granted_by_user_id, reason)
VALUES (
    '11111111-1111-1111-1111-111111111112',
    (SELECT id FROM zones WHERE code = 'NR'),
    '11111111-1111-1111-1111-111111111106',
    'Cross-zone NR grant for zone-dashboard gate test'
)
ON CONFLICT (user_id, zone_id) DO NOTHING;
