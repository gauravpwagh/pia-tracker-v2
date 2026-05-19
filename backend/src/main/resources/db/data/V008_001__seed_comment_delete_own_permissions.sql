-- V008_001__seed_comment_delete_own_permissions.sql
-- Phase 1.13: Grant COMMENT.DELETE.OWN to all roles that can post comments,
-- so users can delete their own comments from the right-panel.
-- COMMENT.DELETE.ANY (moderation) was already on ROLE_ADMIN in V001_007.

INSERT INTO role_permissions (role_code, permission_code) VALUES
('ROLE_EDGS_CI',         'COMMENT.DELETE.OWN'),
('ROLE_CAO_C',           'COMMENT.DELETE.OWN'),
('ROLE_CE_C',            'COMMENT.DELETE.OWN'),
('ROLE_DY_CE_C',         'COMMENT.DELETE.OWN'),
('ROLE_NODAL_DY_CE_C',   'COMMENT.DELETE.OWN'),
('ROLE_APPROVER_GENERIC','COMMENT.DELETE.OWN');
