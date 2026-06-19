-- Grant ATTACHMENT.DELETE.OWN to every role that can upload.
-- Dy CE/C and Nodal Dy CE/C could upload but had no way to delete their own files.

INSERT INTO role_permissions (role_code, permission_code)
VALUES
    ('ROLE_DY_CE_C',       'ATTACHMENT.DELETE.OWN'),
    ('ROLE_NODAL_DY_CE_C', 'ATTACHMENT.DELETE.OWN')
ON CONFLICT DO NOTHING;
