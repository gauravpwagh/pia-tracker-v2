-- V001_005__seed_permissions.sql
-- Seeds all permission codes used by the PIA Tracker permission model.
-- is_system_grant = true only for DASHBOARD.VIEW.PAN_INDIA and EXPORT.PAN_INDIA;
-- those two permissions are never attached to a role — they are granted directly
-- to individual users via user_permissions.

INSERT INTO permissions (code, description, category, is_system_grant) VALUES

-- -------------------------------------------------------------------------
-- PROJECT
-- -------------------------------------------------------------------------
('PROJECT.CREATE',            'Create a new project',                                          'PROJECT', false),
('PROJECT.READ.OWN',          'Read projects in the user''s own division / zone',              'PROJECT', false),
('PROJECT.READ.ZONE',         'Read all projects within the user''s zone',                     'PROJECT', false),
('PROJECT.READ.ALL',          'Read all projects across all zones',                            'PROJECT', false),
('PROJECT.UPDATE.OWN',        'Update projects owned by the user',                             'PROJECT', false),
('PROJECT.UPDATE.ALL',        'Update any project regardless of ownership',                    'PROJECT', false),
('PROJECT.DELETE',            'Soft-delete a project',                                         'PROJECT', false),
('PROJECT.ALLOCATE',          'Allocate / assign a project to a CE zone',                      'PROJECT', false),
('PROJECT.ASSIGN_DYCE',       'Assign a Dy CE/C to a project',                                 'PROJECT', false),
('PROJECT.DESIGNATE_NODAL',   'Designate a Nodal Dy CE/C for a project',                       'PROJECT', false),
('PROJECT.HOLD_RESUME',       'Place a project on hold or resume it',                          'PROJECT', false),
('PROJECT.COMPLETE',          'Mark a project as complete',                                     'PROJECT', false),
('PROJECT.DROP',              'Drop / cancel a project',                                        'PROJECT', false),

-- -------------------------------------------------------------------------
-- ACTIVITY
-- -------------------------------------------------------------------------
('ACTIVITY.CREATE.ASSIGNED',  'Create activities on projects the user is assigned to',         'ACTIVITY', false),
('ACTIVITY.READ.OWN',         'Read activities on the user''s own projects / assignments',     'ACTIVITY', false),
('ACTIVITY.READ.ZONE',        'Read all activities within the user''s zone',                   'ACTIVITY', false),
('ACTIVITY.READ.ALL',         'Read all activities across all zones',                          'ACTIVITY', false),
('ACTIVITY.UPDATE.OWN',       'Update activities the user owns or is assigned to',             'ACTIVITY', false),
('ACTIVITY.DELETE',           'Delete an activity',                                            'ACTIVITY', false),

-- -------------------------------------------------------------------------
-- ACTIVITY_RECORD
-- -------------------------------------------------------------------------
('ACTIVITY_RECORD.CREATE.ASSIGNED',  'Create records on activities the user is assigned to',   'ACTIVITY_RECORD', false),
('ACTIVITY_RECORD.READ.OWN',         'Read records on the user''s own activities',             'ACTIVITY_RECORD', false),
('ACTIVITY_RECORD.READ.ZONE',        'Read all records within the user''s zone',               'ACTIVITY_RECORD', false),
('ACTIVITY_RECORD.READ.ALL',         'Read all records across all zones',                      'ACTIVITY_RECORD', false),
('ACTIVITY_RECORD.UPDATE.OWN',       'Update records the user owns or is assigned to',         'ACTIVITY_RECORD', false),
('ACTIVITY_RECORD.SUBMIT',           'Submit a record for verification',                       'ACTIVITY_RECORD', false),
('ACTIVITY_RECORD.VERIFY',           'Verify a submitted record',                              'ACTIVITY_RECORD', false),
('ACTIVITY_RECORD.AUTHENTICATE',     'Authenticate / countersign a verified record',           'ACTIVITY_RECORD', false),
('ACTIVITY_RECORD.SEND_BACK',        'Send a record back to the submitter for correction',     'ACTIVITY_RECORD', false),
('ACTIVITY_RECORD.DELETE',           'Delete an activity record',                              'ACTIVITY_RECORD', false),
('ACTIVITY_RECORD.BULK_TRANSITION',  'Perform bulk state transitions on activity records',     'ACTIVITY_RECORD', false),

-- -------------------------------------------------------------------------
-- DRAWING
-- -------------------------------------------------------------------------
('DRAWING.APPROVE',           'Approve a drawing in the approver checklist',                   'DRAWING', false),
('DRAWING.SEND_BACK',         'Send a drawing back for revision',                              'DRAWING', false),
('DRAWING.EDIT_APPROVERS',    'Add or remove approvers from a drawing checklist',              'DRAWING', false),
('DRAWING.REASSIGN_APPROVER', 'Reassign a drawing approver slot to a different user',          'DRAWING', false),

-- -------------------------------------------------------------------------
-- FORM_DEFINITION
-- -------------------------------------------------------------------------
('FORM_DEFINITION.READ',      'Read published form definitions',                               'FORM_DEFINITION', false),
('FORM_DEFINITION.CREATE',    'Create a new form definition draft',                            'FORM_DEFINITION', false),
('FORM_DEFINITION.UPDATE',    'Update an unpublished form definition draft',                   'FORM_DEFINITION', false),
('FORM_DEFINITION.PUBLISH',   'Publish a form definition draft (makes it live)',               'FORM_DEFINITION', false),

-- -------------------------------------------------------------------------
-- DASHBOARD
-- -------------------------------------------------------------------------
('DASHBOARD.VIEW.PROJECT',    'View dashboard data for the user''s own project',               'DASHBOARD', false),
('DASHBOARD.VIEW.ZONE',       'View dashboard data aggregated at zone level',                  'DASHBOARD', false),
('DASHBOARD.VIEW.PAN_INDIA',  'View pan-India dashboard data across all zones',                'DASHBOARD', true),

-- -------------------------------------------------------------------------
-- EXPORT
-- -------------------------------------------------------------------------
('EXPORT.PROJECT',            'Export data for the user''s own project',                       'EXPORT', false),
('EXPORT.ZONE',               'Export data aggregated at zone level',                          'EXPORT', false),
('EXPORT.PAN_INDIA',          'Export pan-India data across all zones',                        'EXPORT', true),

-- -------------------------------------------------------------------------
-- COMMENT
-- -------------------------------------------------------------------------
('COMMENT.CREATE',            'Post a comment on a record or project',                         'COMMENT', false),
('COMMENT.DELETE.OWN',        'Delete the user''s own comments',                               'COMMENT', false),
('COMMENT.DELETE.ANY',        'Delete any comment (moderation)',                               'COMMENT', false),

-- -------------------------------------------------------------------------
-- ATTACHMENT
-- -------------------------------------------------------------------------
('ATTACHMENT.UPLOAD.OWN_RECORDS', 'Upload attachments to records the user owns',              'ATTACHMENT', false),
('ATTACHMENT.DOWNLOAD',           'Download any attachment the user can read',                 'ATTACHMENT', false),
('ATTACHMENT.DELETE.OWN',         'Delete attachments the user uploaded',                      'ATTACHMENT', false),
('ATTACHMENT.DELETE.ANY',         'Delete any attachment (moderation)',                        'ATTACHMENT', false),

-- -------------------------------------------------------------------------
-- USER_MANAGEMENT
-- -------------------------------------------------------------------------
('USER.READ',              'Read user profiles and role assignments',                          'USER_MANAGEMENT', false),
('USER.CREATE',            'Create a new user account',                                        'USER_MANAGEMENT', false),
('USER.UPDATE',            'Update an existing user account',                                  'USER_MANAGEMENT', false),
('USER.DEACTIVATE',        'Deactivate a user account',                                        'USER_MANAGEMENT', false),
('ROLE.MANAGE',            'Create, update, and assign roles',                                 'USER_MANAGEMENT', false),
('PERMISSION.GRANT',       'Grant or revoke individual permissions to users',                  'USER_MANAGEMENT', false),
('FEATURE_FLAG.MANAGE',    'Enable or disable feature flags',                                  'USER_MANAGEMENT', false),
('AUDIT_LOG.READ.OWN',     'Read audit log entries related to the user''s own actions',       'USER_MANAGEMENT', false),
('AUDIT_LOG.READ.ALL',     'Read all audit log entries across the system',                     'USER_MANAGEMENT', false);
