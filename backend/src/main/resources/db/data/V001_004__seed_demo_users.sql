-- PIA Tracker — V001_004 Demo seed: 6 representative users for development / beta
-- UUIDs are fixed so tests and demo scripts can reference them by ID.

INSERT INTO users (id, employee_id, name, email, designation_code, primary_zone_id, is_active, is_system_user)
VALUES
    (
        '11111111-1111-1111-1111-111111111101',
        'EMP001',
        'Rajesh Kumar Singh',
        'rajesh.kumar@nr.railnet.gov.in',
        'EDGS_CI',
        (SELECT id FROM zones WHERE code = 'NR'),
        true,
        false
    ),
    (
        '11111111-1111-1111-1111-111111111102',
        'EMP002',
        'Priya Sharma',
        'priya.sharma@nr.railnet.gov.in',
        'CAO_C',
        (SELECT id FROM zones WHERE code = 'NR'),
        true,
        false
    ),
    (
        '11111111-1111-1111-1111-111111111103',
        'EMP003',
        'Amit Verma',
        'amit.verma@nr.railnet.gov.in',
        'CE_C',
        (SELECT id FROM zones WHERE code = 'NR'),
        true,
        false
    ),
    (
        '11111111-1111-1111-1111-111111111104',
        'EMP004',
        'Sunita Patel',
        'sunita.patel@nr.railnet.gov.in',
        'DY_CE_C',
        (SELECT id FROM zones WHERE code = 'NR'),
        true,
        false
    ),
    (
        '11111111-1111-1111-1111-111111111105',
        'EMP005',
        'Mohammed Asif',
        'mohammed.asif@nr.railnet.gov.in',
        'DY_CE_C',
        (SELECT id FROM zones WHERE code = 'NR'),
        true,
        false
    ),
    (
        '11111111-1111-1111-1111-111111111106',
        'EMP006',
        'Admin User',
        'admin@pia.railnet.gov.in',
        'ADMIN',
        null,
        true,
        true
    );
