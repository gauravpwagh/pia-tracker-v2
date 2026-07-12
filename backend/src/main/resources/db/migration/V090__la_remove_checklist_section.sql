-- V090: Remove the Checklist section from LAND_ACQUISITION_V1 (added in V078).
-- The KMZ/Drone/SRP/CALA documents moved from a per-record section to the Activity
-- Scope checklist (entityType PROJECT_ACTIVITY__<key>) — see #11/#16. The per-record
-- section is now redundant and was still showing as a workflow step in the record editor.
-- Existing checklist.* attachment values (entityType ACTIVITY_RECORD__<key>) are left
-- in place untouched; they simply stop being referenced by the form.

-- Step 1: Remove checklist from section_codes
UPDATE form_definitions
SET section_codes = ARRAY['acquisition_details','srp','cala','section_20a','jmr','section_20d','section_20e','section_20f_g','section_20h_i','mutation']
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

-- Step 2: Remove checklist from root ui:order
UPDATE form_definitions
SET ui_schema_json = jsonb_set(
    ui_schema_json,
    '{ui:order}',
    '["acquisition_details","srp","cala","section_20a","jmr","section_20d","section_20e","section_20f_g","section_20h_i","mutation"]'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

-- Step 3: Remove the checklist property from schema_json and its ui schema entry
UPDATE form_definitions
SET schema_json = schema_json #- '{properties,checklist}'
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

UPDATE form_definitions
SET ui_schema_json = ui_schema_json #- '{checklist}'
WHERE id = 'ffffffff-0001-0001-0001-000000000001';
