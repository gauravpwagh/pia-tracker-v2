-- V001_011: Grant CE/C the ability to create and delete activity records.
--
-- Rationale (workflow.md § 4.5):
--   CE/C authenticates entries. Before authenticating, CE/C may add, delete,
--   or modify data for any activity type.
--
-- The permission codes already exist in V001_005:
--   ACTIVITY_RECORD.CREATE.ASSIGNED  — create records
--   ACTIVITY_RECORD.DELETE           — soft-delete non-authenticated records
--   ACTIVITY_RECORD.UPDATE.OWN       — modify record data (already on ROLE_CE_C)
--
-- DY_CE_C and NODAL_DY_CE_C also receive DELETE so they can remove their own
-- draft records.

INSERT INTO role_permissions (role_code, permission_code) VALUES
    ('ROLE_CE_C',          'ACTIVITY_RECORD.CREATE.ASSIGNED'),
    ('ROLE_CE_C',          'ACTIVITY_RECORD.DELETE'),
    ('ROLE_DY_CE_C',       'ACTIVITY_RECORD.DELETE'),
    ('ROLE_NODAL_DY_CE_C', 'ACTIVITY_RECORD.DELETE');
