-- V087_001: Permission for the Admin/SuperAdmin-only "Logs" sidebar link (Grafana).
-- Grafana itself has its own separate login (not proxied) — this permission only
-- gates whether the sidebar shows the link at all.

INSERT INTO permissions (code, description, category, is_system_grant)
VALUES ('SYSTEM_LOG.READ', 'View application/security logs (Grafana)', 'SYSTEM', false);

INSERT INTO role_permissions (role_code, permission_code) VALUES
('ROLE_ADMIN', 'SYSTEM_LOG.READ'),
('ROLE_SUPER_ADMIN', 'SYSTEM_LOG.READ');
