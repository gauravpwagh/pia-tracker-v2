-- V084__project_designate_primary_ce_permission.sql
-- Adds the PROJECT.DESIGNATE_PRIMARY_CE permission (mirrors PROJECT.DESIGNATE_NODAL,
-- but for the CAO/C -> CE/C relationship) and grants it to ROLE_CAO_C / ROLE_SUPER_ADMIN.

INSERT INTO permissions (code, description, category, is_system_grant)
VALUES ('PROJECT.DESIGNATE_PRIMARY_CE', 'Designate the primary CE/C among those assigned to a project', 'PROJECT', false);

INSERT INTO role_permissions (role_code, permission_code) VALUES
('ROLE_CAO_C', 'PROJECT.DESIGNATE_PRIMARY_CE'),
('ROLE_SUPER_ADMIN', 'PROJECT.DESIGNATE_PRIMARY_CE');
