-- V001_006__seed_roles.sql
-- Seeds the nine application roles used by PIA Tracker.
-- ROLE_NODAL_DY_CE_C is intentionally absent from designation_default_roles;
-- it is granted per-project on Nodal Dy CE/C assignment, never by designation.

INSERT INTO roles (code, name, description, is_active) VALUES

('ROLE_EDGS_CI',
 'EDGS/C-I',
 'Engineer Director General of Services / Construction-I. '
 'Pan-India oversight: creates projects, reads all, can drop projects. '
 'Holds system-grant permissions DASHBOARD.VIEW.PAN_INDIA and EXPORT.PAN_INDIA.',
 true),

('ROLE_CAO_C',
 'CAO/C',
 'Chief Accounts Officer / Construction. '
 'Zone-level financial oversight: allocates projects to CE zones, '
 'manages hold/resume, reads zone-wide activities and records.',
 true),

('ROLE_CE_C',
 'CE/C',
 'Chief Engineer / Construction. '
 'Zone-level engineering head: assigns Dy CE/C, designates Nodal Dy CE/C, '
 'authenticates and bulk-transitions records, manages drawing approvers.',
 true),

('ROLE_DY_CE_C',
 'Dy CE/C',
 'Deputy Chief Engineer / Construction. '
 'Project-level field engineer: creates and updates activities and records, '
 'submits records for verification, manages own attachments.',
 true),

('ROLE_NODAL_DY_CE_C',
 'Nodal Dy CE/C',
 'Nodal Deputy Chief Engineer / Construction. '
 'Extends Dy CE/C with verification, send-back, and drawing approver management. '
 'Granted per-project on assignment — not a designation default.',
 true),

('ROLE_APPROVER_GENERIC',
 'Generic Approver (drawing roles)',
 'Granted to any discipline officer who appears in a drawing approver checklist. '
 'Covers approval, send-back, attachment download, and commenting.',
 true),

('ROLE_ADMIN',
 'System Administrator',
 'Internal IT administrator: manages users, roles, form definitions, '
 'feature flags, and can moderate comments and attachments. '
 'Cannot escalate to SUPER_ADMIN without a separate grant.',
 true),

('ROLE_SUPER_ADMIN',
 'Super Administrator',
 'Unrestricted access to all 60 permission codes. '
 'Reserved for initial setup and emergency break-glass use; '
 'assignment requires a two-person approval workflow.',
 true),

('ROLE_BOARD_VIEWER',
 'Board / HQ Viewer (system grant)',
 'Read-only pan-India viewer for Railway Board / HQ personnel. '
 'Holds system-grant permissions DASHBOARD.VIEW.PAN_INDIA and EXPORT.PAN_INDIA. '
 'Granted via user_permissions, not by designation default.',
 true);
