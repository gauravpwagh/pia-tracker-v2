-- Grant pia_app access to all summary tables created by pia_migrator.
-- These are written by SummaryUpdater (triggered on workflow transitions,
-- record saves, etc.) and read by dashboard queries.  Without these grants
-- the workflow submit action returns 500 "permission denied for table …".

GRANT SELECT, INSERT, UPDATE, DELETE ON project_summary               TO pia_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON zone_summary                  TO pia_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON pan_india_summary             TO pia_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON project_activity_summary      TO pia_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON project_utility_subtype_summary TO pia_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON project_forest_stage_summary  TO pia_app;
