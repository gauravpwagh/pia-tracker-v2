-- V001_009__seed_demo_user_scr.sql
-- Inserts a CE/C demo user in the SCR (South Central Railway) zone.
-- This user is used by zone-filter integration tests to verify that
-- PROJECT.READ.OWN and ACTIVITY.READ.OWN are correctly scoped to the
-- user's primary_zone_id when the principal holds ROLE_CE_C.
--
-- UUID is fixed so integration test assertions can reference it by ID.
-- The zone sub-select will fail fast (zero rows) if SCR is not in the
-- zones table, which is the desired behaviour during CI.

INSERT INTO users (id, employee_id, name, email, designation_code, primary_zone_id, is_active, is_system_user)
VALUES (
    '22222222-2222-2222-2222-222222222201',
    'EMP201',
    'Venkatesh Rao',
    'venkatesh.rao@scr.railnet.gov.in',
    'CE_C',
    (SELECT id FROM zones WHERE code = 'SCR'),
    true,
    false
);
