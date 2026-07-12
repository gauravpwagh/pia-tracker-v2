-- V089: Add total_count (scope) to land_acquisition_details.
-- Every other activity type's detail table got this column (V041/V042/V043/V044) when the
-- Activity Scope "Total count of <Activity>" field was added — Land Acquisition was missed,
-- so the scope silently failed to persist total_count and the Add Record gate never enabled.

ALTER TABLE land_acquisition_details
  ADD COLUMN IF NOT EXISTS total_count INTEGER;
