-- V001_013: Give ROLE_APPROVER_GENERIC the minimum read access needed to
-- navigate to and approve drawings.
--
-- Previously approver users (SR_DEN, DY_CEE, CBE, etc.) had only
-- DRAWING.APPROVE and DRAWING.SEND_BACK — they received a 403 on
-- GET /api/v1/projects and could not load the record edit page either.
--
-- With PROJECT.READ.OWN the PermissionEvaluator gate passes; the service
-- layer then filters via findAllByAssignedUser which returns an empty list
-- (approvers are not in project_assignments).  They see an empty tree but no
-- 403.  They can still reach records via notification deep-links.
--
-- ACTIVITY_RECORD.READ.OWN is required to load the record edit page that
-- hosts the drawing approval form and approver list.

INSERT INTO role_permissions (role_code, permission_code) VALUES
    ('ROLE_APPROVER_GENERIC', 'PROJECT.READ.OWN'),
    ('ROLE_APPROVER_GENERIC', 'ACTIVITY.READ.OWN'),
    ('ROLE_APPROVER_GENERIC', 'ACTIVITY_RECORD.READ.OWN');
