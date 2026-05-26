-- Grant SELECT, INSERT, UPDATE, DELETE on all activity detail tables to the
-- application user.  These tables were created in V022 by the migrator user
-- which holds a different role, so an explicit grant is required.

GRANT SELECT, INSERT, UPDATE, DELETE ON land_acquisition_details        TO pia_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON forest_clearance_details        TO pia_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON utility_shifting_details        TO pia_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON drawing_approval_details        TO pia_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON tender_packaging_details        TO pia_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON temporary_office_space_details  TO pia_app;
