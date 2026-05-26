-- Grant ACTIVITY.UPDATE.OWN to Dy CE/C and Nodal Dy CE/C so they can
-- edit activity metadata (name, scope notes, target date) for activities
-- they created / are assigned to.  CE/C and SUPER_ADMIN were already seeded
-- in V001_007.

INSERT INTO role_permissions (role_code, permission_code)
VALUES
    ('ROLE_DY_CE_C',       'ACTIVITY.UPDATE.OWN'),
    ('ROLE_NODAL_DY_CE_C', 'ACTIVITY.UPDATE.OWN')
ON CONFLICT DO NOTHING;
