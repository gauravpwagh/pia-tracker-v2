-- V001_007__seed_role_permissions.sql
-- Maps each role to its permission codes.
-- One INSERT per role with a VALUES list for easy diff review.
-- ROLE_SUPER_ADMIN receives all 60 permission codes seeded in V001_005.

-- -------------------------------------------------------------------------
-- ROLE_EDGS_CI
-- Pan-India project creator/overseer with system-grant dashboard + export.
-- -------------------------------------------------------------------------
INSERT INTO role_permissions (role_code, permission_code) VALUES
('ROLE_EDGS_CI', 'PROJECT.CREATE'),
('ROLE_EDGS_CI', 'PROJECT.READ.ALL'),
('ROLE_EDGS_CI', 'PROJECT.UPDATE.OWN'),
('ROLE_EDGS_CI', 'PROJECT.DROP'),
('ROLE_EDGS_CI', 'DASHBOARD.VIEW.PAN_INDIA'),
('ROLE_EDGS_CI', 'EXPORT.PAN_INDIA'),
('ROLE_EDGS_CI', 'COMMENT.CREATE'),
('ROLE_EDGS_CI', 'AUDIT_LOG.READ.OWN');

-- -------------------------------------------------------------------------
-- ROLE_CAO_C
-- Zone-level accounts officer: allocates projects, zone-wide read + export.
-- -------------------------------------------------------------------------
INSERT INTO role_permissions (role_code, permission_code) VALUES
('ROLE_CAO_C', 'PROJECT.READ.ZONE'),
('ROLE_CAO_C', 'PROJECT.ALLOCATE'),
('ROLE_CAO_C', 'PROJECT.HOLD_RESUME'),
('ROLE_CAO_C', 'ACTIVITY.READ.ZONE'),
('ROLE_CAO_C', 'ACTIVITY_RECORD.READ.ZONE'),
('ROLE_CAO_C', 'DASHBOARD.VIEW.ZONE'),
('ROLE_CAO_C', 'EXPORT.ZONE'),
('ROLE_CAO_C', 'COMMENT.CREATE'),
('ROLE_CAO_C', 'AUDIT_LOG.READ.OWN');

-- -------------------------------------------------------------------------
-- ROLE_CE_C
-- Zonal chief engineer: full project lifecycle + record authentication.
-- -------------------------------------------------------------------------
INSERT INTO role_permissions (role_code, permission_code) VALUES
('ROLE_CE_C', 'PROJECT.READ.OWN'),
('ROLE_CE_C', 'PROJECT.ASSIGN_DYCE'),
('ROLE_CE_C', 'PROJECT.DESIGNATE_NODAL'),
('ROLE_CE_C', 'PROJECT.HOLD_RESUME'),
('ROLE_CE_C', 'PROJECT.COMPLETE'),
('ROLE_CE_C', 'ACTIVITY.READ.OWN'),
('ROLE_CE_C', 'ACTIVITY.UPDATE.OWN'),
('ROLE_CE_C', 'ACTIVITY_RECORD.READ.OWN'),
('ROLE_CE_C', 'ACTIVITY_RECORD.UPDATE.OWN'),
('ROLE_CE_C', 'ACTIVITY_RECORD.AUTHENTICATE'),
('ROLE_CE_C', 'ACTIVITY_RECORD.SEND_BACK'),
('ROLE_CE_C', 'ACTIVITY_RECORD.BULK_TRANSITION'),
('ROLE_CE_C', 'DRAWING.EDIT_APPROVERS'),
('ROLE_CE_C', 'DRAWING.REASSIGN_APPROVER'),
('ROLE_CE_C', 'DASHBOARD.VIEW.PROJECT'),
('ROLE_CE_C', 'EXPORT.PROJECT'),
('ROLE_CE_C', 'ATTACHMENT.DOWNLOAD'),
('ROLE_CE_C', 'COMMENT.CREATE'),
('ROLE_CE_C', 'AUDIT_LOG.READ.OWN');

-- -------------------------------------------------------------------------
-- ROLE_DY_CE_C
-- Project-level field engineer: creates / submits records, owns attachments.
-- -------------------------------------------------------------------------
INSERT INTO role_permissions (role_code, permission_code) VALUES
('ROLE_DY_CE_C', 'PROJECT.READ.OWN'),
('ROLE_DY_CE_C', 'ACTIVITY.CREATE.ASSIGNED'),
('ROLE_DY_CE_C', 'ACTIVITY.READ.OWN'),
('ROLE_DY_CE_C', 'ACTIVITY_RECORD.CREATE.ASSIGNED'),
('ROLE_DY_CE_C', 'ACTIVITY_RECORD.READ.OWN'),
('ROLE_DY_CE_C', 'ACTIVITY_RECORD.UPDATE.OWN'),
('ROLE_DY_CE_C', 'ACTIVITY_RECORD.SUBMIT'),
('ROLE_DY_CE_C', 'ATTACHMENT.UPLOAD.OWN_RECORDS'),
('ROLE_DY_CE_C', 'ATTACHMENT.DOWNLOAD'),
('ROLE_DY_CE_C', 'COMMENT.CREATE'),
('ROLE_DY_CE_C', 'DASHBOARD.VIEW.PROJECT'),
('ROLE_DY_CE_C', 'AUDIT_LOG.READ.OWN');

-- -------------------------------------------------------------------------
-- ROLE_NODAL_DY_CE_C
-- Extends Dy CE/C with verify, send-back, and drawing approver management.
-- Granted per-project on assignment; not a designation default.
-- -------------------------------------------------------------------------
INSERT INTO role_permissions (role_code, permission_code) VALUES
('ROLE_NODAL_DY_CE_C', 'PROJECT.READ.OWN'),
('ROLE_NODAL_DY_CE_C', 'ACTIVITY.CREATE.ASSIGNED'),
('ROLE_NODAL_DY_CE_C', 'ACTIVITY.READ.OWN'),
('ROLE_NODAL_DY_CE_C', 'ACTIVITY_RECORD.CREATE.ASSIGNED'),
('ROLE_NODAL_DY_CE_C', 'ACTIVITY_RECORD.READ.OWN'),
('ROLE_NODAL_DY_CE_C', 'ACTIVITY_RECORD.UPDATE.OWN'),
('ROLE_NODAL_DY_CE_C', 'ACTIVITY_RECORD.SUBMIT'),
('ROLE_NODAL_DY_CE_C', 'ATTACHMENT.UPLOAD.OWN_RECORDS'),
('ROLE_NODAL_DY_CE_C', 'ATTACHMENT.DOWNLOAD'),
('ROLE_NODAL_DY_CE_C', 'COMMENT.CREATE'),
('ROLE_NODAL_DY_CE_C', 'DASHBOARD.VIEW.PROJECT'),
('ROLE_NODAL_DY_CE_C', 'AUDIT_LOG.READ.OWN'),
('ROLE_NODAL_DY_CE_C', 'ACTIVITY_RECORD.VERIFY'),
('ROLE_NODAL_DY_CE_C', 'ACTIVITY_RECORD.SEND_BACK'),
('ROLE_NODAL_DY_CE_C', 'DRAWING.EDIT_APPROVERS');

-- -------------------------------------------------------------------------
-- ROLE_APPROVER_GENERIC
-- Discipline officers in drawing approver checklists.
-- -------------------------------------------------------------------------
INSERT INTO role_permissions (role_code, permission_code) VALUES
('ROLE_APPROVER_GENERIC', 'DRAWING.APPROVE'),
('ROLE_APPROVER_GENERIC', 'DRAWING.SEND_BACK'),
('ROLE_APPROVER_GENERIC', 'ATTACHMENT.DOWNLOAD'),
('ROLE_APPROVER_GENERIC', 'COMMENT.CREATE');

-- -------------------------------------------------------------------------
-- ROLE_ADMIN
-- IT administrator: user / role / form / feature-flag management.
-- -------------------------------------------------------------------------
INSERT INTO role_permissions (role_code, permission_code) VALUES
('ROLE_ADMIN', 'USER.READ'),
('ROLE_ADMIN', 'USER.CREATE'),
('ROLE_ADMIN', 'USER.UPDATE'),
('ROLE_ADMIN', 'USER.DEACTIVATE'),
('ROLE_ADMIN', 'ROLE.MANAGE'),
('ROLE_ADMIN', 'FORM_DEFINITION.READ'),
('ROLE_ADMIN', 'FORM_DEFINITION.UPDATE'),
('ROLE_ADMIN', 'FORM_DEFINITION.PUBLISH'),
('ROLE_ADMIN', 'FEATURE_FLAG.MANAGE'),
('ROLE_ADMIN', 'AUDIT_LOG.READ.ALL'),
('ROLE_ADMIN', 'COMMENT.DELETE.ANY'),
('ROLE_ADMIN', 'ATTACHMENT.DELETE.ANY');

-- -------------------------------------------------------------------------
-- ROLE_SUPER_ADMIN
-- All 60 permission codes. Reserved for break-glass / initial setup.
-- -------------------------------------------------------------------------
INSERT INTO role_permissions (role_code, permission_code) VALUES
('ROLE_SUPER_ADMIN', 'PROJECT.CREATE'),
('ROLE_SUPER_ADMIN', 'PROJECT.READ.OWN'),
('ROLE_SUPER_ADMIN', 'PROJECT.READ.ZONE'),
('ROLE_SUPER_ADMIN', 'PROJECT.READ.ALL'),
('ROLE_SUPER_ADMIN', 'PROJECT.UPDATE.OWN'),
('ROLE_SUPER_ADMIN', 'PROJECT.UPDATE.ALL'),
('ROLE_SUPER_ADMIN', 'PROJECT.DELETE'),
('ROLE_SUPER_ADMIN', 'PROJECT.ALLOCATE'),
('ROLE_SUPER_ADMIN', 'PROJECT.ASSIGN_DYCE'),
('ROLE_SUPER_ADMIN', 'PROJECT.DESIGNATE_NODAL'),
('ROLE_SUPER_ADMIN', 'PROJECT.HOLD_RESUME'),
('ROLE_SUPER_ADMIN', 'PROJECT.COMPLETE'),
('ROLE_SUPER_ADMIN', 'PROJECT.DROP'),
('ROLE_SUPER_ADMIN', 'ACTIVITY.CREATE.ASSIGNED'),
('ROLE_SUPER_ADMIN', 'ACTIVITY.READ.OWN'),
('ROLE_SUPER_ADMIN', 'ACTIVITY.READ.ZONE'),
('ROLE_SUPER_ADMIN', 'ACTIVITY.READ.ALL'),
('ROLE_SUPER_ADMIN', 'ACTIVITY.UPDATE.OWN'),
('ROLE_SUPER_ADMIN', 'ACTIVITY.DELETE'),
('ROLE_SUPER_ADMIN', 'ACTIVITY_RECORD.CREATE.ASSIGNED'),
('ROLE_SUPER_ADMIN', 'ACTIVITY_RECORD.READ.OWN'),
('ROLE_SUPER_ADMIN', 'ACTIVITY_RECORD.READ.ZONE'),
('ROLE_SUPER_ADMIN', 'ACTIVITY_RECORD.READ.ALL'),
('ROLE_SUPER_ADMIN', 'ACTIVITY_RECORD.UPDATE.OWN'),
('ROLE_SUPER_ADMIN', 'ACTIVITY_RECORD.SUBMIT'),
('ROLE_SUPER_ADMIN', 'ACTIVITY_RECORD.VERIFY'),
('ROLE_SUPER_ADMIN', 'ACTIVITY_RECORD.AUTHENTICATE'),
('ROLE_SUPER_ADMIN', 'ACTIVITY_RECORD.SEND_BACK'),
('ROLE_SUPER_ADMIN', 'ACTIVITY_RECORD.DELETE'),
('ROLE_SUPER_ADMIN', 'ACTIVITY_RECORD.BULK_TRANSITION'),
('ROLE_SUPER_ADMIN', 'DRAWING.APPROVE'),
('ROLE_SUPER_ADMIN', 'DRAWING.SEND_BACK'),
('ROLE_SUPER_ADMIN', 'DRAWING.EDIT_APPROVERS'),
('ROLE_SUPER_ADMIN', 'DRAWING.REASSIGN_APPROVER'),
('ROLE_SUPER_ADMIN', 'FORM_DEFINITION.READ'),
('ROLE_SUPER_ADMIN', 'FORM_DEFINITION.CREATE'),
('ROLE_SUPER_ADMIN', 'FORM_DEFINITION.UPDATE'),
('ROLE_SUPER_ADMIN', 'FORM_DEFINITION.PUBLISH'),
('ROLE_SUPER_ADMIN', 'DASHBOARD.VIEW.PROJECT'),
('ROLE_SUPER_ADMIN', 'DASHBOARD.VIEW.ZONE'),
('ROLE_SUPER_ADMIN', 'DASHBOARD.VIEW.PAN_INDIA'),
('ROLE_SUPER_ADMIN', 'EXPORT.PROJECT'),
('ROLE_SUPER_ADMIN', 'EXPORT.ZONE'),
('ROLE_SUPER_ADMIN', 'EXPORT.PAN_INDIA'),
('ROLE_SUPER_ADMIN', 'COMMENT.CREATE'),
('ROLE_SUPER_ADMIN', 'COMMENT.DELETE.OWN'),
('ROLE_SUPER_ADMIN', 'COMMENT.DELETE.ANY'),
('ROLE_SUPER_ADMIN', 'ATTACHMENT.UPLOAD.OWN_RECORDS'),
('ROLE_SUPER_ADMIN', 'ATTACHMENT.DOWNLOAD'),
('ROLE_SUPER_ADMIN', 'ATTACHMENT.DELETE.OWN'),
('ROLE_SUPER_ADMIN', 'ATTACHMENT.DELETE.ANY'),
('ROLE_SUPER_ADMIN', 'USER.READ'),
('ROLE_SUPER_ADMIN', 'USER.CREATE'),
('ROLE_SUPER_ADMIN', 'USER.UPDATE'),
('ROLE_SUPER_ADMIN', 'USER.DEACTIVATE'),
('ROLE_SUPER_ADMIN', 'ROLE.MANAGE'),
('ROLE_SUPER_ADMIN', 'PERMISSION.GRANT'),
('ROLE_SUPER_ADMIN', 'FEATURE_FLAG.MANAGE'),
('ROLE_SUPER_ADMIN', 'AUDIT_LOG.READ.OWN'),
('ROLE_SUPER_ADMIN', 'AUDIT_LOG.READ.ALL');

-- -------------------------------------------------------------------------
-- ROLE_BOARD_VIEWER
-- Read-only pan-India viewer for Railway Board / HQ personnel.
-- -------------------------------------------------------------------------
INSERT INTO role_permissions (role_code, permission_code) VALUES
('ROLE_BOARD_VIEWER', 'PROJECT.READ.ALL'),
('ROLE_BOARD_VIEWER', 'ACTIVITY.READ.ALL'),
('ROLE_BOARD_VIEWER', 'ACTIVITY_RECORD.READ.ALL'),
('ROLE_BOARD_VIEWER', 'DASHBOARD.VIEW.PAN_INDIA'),
('ROLE_BOARD_VIEWER', 'EXPORT.PAN_INDIA'),
('ROLE_BOARD_VIEWER', 'ATTACHMENT.DOWNLOAD'),
('ROLE_BOARD_VIEWER', 'AUDIT_LOG.READ.OWN');
