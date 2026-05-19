-- V001_010__seed_inbox_test_users.sql
-- Two extra demo users for inbox / zone-filter integration tests.
--
-- 107: SUPER_ADMIN — used to verify zone filter is bypassed for super-admins.
-- 108: DY_CE_C in SR zone — used to verify zone isolation (NR records not visible).
--
-- UUIDs are fixed so integration tests can reference them by ID.

INSERT INTO users (id, employee_id, name, email, designation_code, primary_zone_id, is_active, is_system_user)
VALUES
    (
        '11111111-1111-1111-1111-111111111107',
        'EMP007',
        'Super Admin User',
        'superadmin@pia.railnet.gov.in',
        'SUPER_ADMIN',
        null,
        true,
        true
    ),
    (
        '11111111-1111-1111-1111-111111111108',
        'EMP008',
        'Lakshmi Narasimhan',
        'lakshmi.narasimhan@sr.railnet.gov.in',
        'DY_CE_C',
        (SELECT id FROM zones WHERE code = 'SR'),
        true,
        false
    );
