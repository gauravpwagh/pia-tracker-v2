-- Grant pia_app access to drawing_approvers.
-- The table was created in V014 by pia_migrator; the app user was never
-- granted access, causing "permission denied for table drawing_approvers"
-- whenever DrawingService.seedDefaultApprovers is called (e.g. on record create).

GRANT SELECT, INSERT, UPDATE, DELETE ON drawing_approvers TO pia_app;
