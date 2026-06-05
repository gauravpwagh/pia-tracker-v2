-- V001_012: Fix read-all gaps for EDGS/CI and ADMIN.
--
-- ROLE_EDGS_CI had PROJECT.READ.ALL but no ACTIVITY.READ.* at all,
-- so the tree could list projects but expanded activities returned 403.
-- Adding ACTIVITY.READ.ALL (scope implication covers .ZONE and .OWN gates).
--
-- ROLE_ADMIN had no project or activity read access, so admins could not
-- navigate the projects tree at all.  Adding .READ.ALL for project, activity,
-- and activity_record gives full read-only visibility.  Write and workflow
-- permissions are deliberately NOT added — admin is view-only on operations.

INSERT INTO role_permissions (role_code, permission_code) VALUES
    -- EDGS/CI: can now see all activities across all projects in the tree
    ('ROLE_EDGS_CI',  'ACTIVITY.READ.ALL'),
    ('ROLE_EDGS_CI',  'ACTIVITY_RECORD.READ.ALL'),

    -- ADMIN: full read-only view of projects, activities, and records
    ('ROLE_ADMIN',    'PROJECT.READ.ALL'),
    ('ROLE_ADMIN',    'ACTIVITY.READ.ALL'),
    ('ROLE_ADMIN',    'ACTIVITY_RECORD.READ.ALL');
