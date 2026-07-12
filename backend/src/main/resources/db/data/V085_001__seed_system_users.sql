-- PIA Tracker — V085_001: system users seed.
-- Runs AFTER V085 (which adds password_hash / password_updated_at), so the hashes below
-- can be written directly. The database starts with ONLY these two administrators; every
-- other officer is provisioned with scripts/import_users.py. The demo/test/HRMS user
-- seeds were removed on purpose.
--
-- Initial passwords are BCrypt hashes (strength 10, $2a$) matching the backend's
-- BCryptPasswordEncoder, so login works immediately (no first-login lazy init):
--   ADMIN001  -> admin123    (designation ADMIN       -> ROLE_ADMIN)
--   SADMIN001 -> sadmin123   (designation SUPER_ADMIN  -> ROLE_SUPER_ADMIN)
-- Change these after first login (My Profile). Username = employee id or email.

INSERT INTO users (id, employee_id, name, email, designation_code, primary_zone_id,
                   is_active, is_system_user, password_hash, password_updated_at)
VALUES
    (
        '11111111-1111-1111-1111-111111111101',
        'ADMIN001',
        'System Administrator',
        'admin@pia.railnet.gov.in',
        'ADMIN',
        null,
        true,
        true,
        '$2a$10$ktV89KDDLsfhs1ninG4cJOi83CuIytwpCjQh1Tl3uvgrH4VZahg3e',
        now()
    ),
    (
        '11111111-1111-1111-1111-111111111102',
        'SADMIN001',
        'Super Administrator',
        'superadmin@pia.railnet.gov.in',
        'SUPER_ADMIN',
        null,
        true,
        true,
        '$2a$10$zLdWHVD8YbQGd95pY4F3zuvSpKwhYYIbIE3fWNqyDv0mOsq2mckZG',
        now()
    )
ON CONFLICT (employee_id) DO NOTHING;
