-- V087_002: Grant CE/C the ability to create activities.
--
-- Rationale (workflow.md § 4.5, and consistent with V001_011):
--   CE/C authenticates entries and may add/modify data for any activity type
--   before authenticating. CE/C already holds ACTIVITY_RECORD.CREATE.ASSIGNED
--   (V001_011) and ActivityService.requireDyceAssignment already returns early
--   for a CE/C designation. The only missing piece was the ACTIVITY.CREATE.ASSIGNED
--   role grant, which caused the workspace's on-demand activity creation to 403
--   when a CE/C added the first record of an activity type.
--
-- The permission code already exists in V001_005:
--   ACTIVITY.CREATE.ASSIGNED — create activities on assigned projects.

INSERT INTO role_permissions (role_code, permission_code) VALUES
    ('ROLE_CE_C', 'ACTIVITY.CREATE.ASSIGNED');
