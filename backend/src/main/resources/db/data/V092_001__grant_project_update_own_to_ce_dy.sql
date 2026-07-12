-- V092_001: Let CE/C and Dy CE/C edit their own project's Details (Length, Station
-- names) from the Overview "Edit Details" panel (#8). PROJECT.UPDATE.OWN already
-- existed (granted to ROLE_EDGS_CI / ROLE_SUPER_ADMIN) but not to the project's own
-- assigned officers.

INSERT INTO role_permissions (role_code, permission_code)
VALUES
    ('ROLE_CE_C',            'PROJECT.UPDATE.OWN'),
    ('ROLE_DY_CE_C',         'PROJECT.UPDATE.OWN'),
    ('ROLE_NODAL_DY_CE_C',   'PROJECT.UPDATE.OWN')
ON CONFLICT DO NOTHING;
