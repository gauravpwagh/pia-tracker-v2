-- V051 granted ATTACHMENT.DELETE.OWN to every role that could upload
-- (ATTACHMENT.UPLOAD.OWN_RECORDS), but V094_001 later gave CE/C upload rights
-- without the matching delete-own grant, so CE/C could upload attachments
-- (e.g. Utility Shifting photos) but not delete their own mistakes — DELETE
-- returned 403. Close the gap, same policy as V051.

INSERT INTO role_permissions (role_code, permission_code)
VALUES ('ROLE_CE_C', 'ATTACHMENT.DELETE.OWN')
ON CONFLICT DO NOTHING;
