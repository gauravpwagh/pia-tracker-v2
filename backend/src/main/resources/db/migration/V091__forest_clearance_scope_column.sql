-- V091: Add total_count (scope) to forest_clearance_details.
-- Same gap as V089 for Land Acquisition — every other activity type's detail table has
-- total_count for the Activity Scope "Total count of <Activity>" field; Forest Clearance
-- was also missed, so its scope silently failed to persist and the Add Record gate never enabled.

ALTER TABLE forest_clearance_details
  ADD COLUMN IF NOT EXISTS total_count INTEGER;
