-- V119: move the "Land Coverage" progress block (added in V116 under Section
-- 20E) into Acquisition Details instead — it's a record-wide progress summary,
-- not specific to Section 20E, and belongs alongside the Private/Govt/Forest
-- Land figures it reads from. Renamed "Land Coverage Progress" (was "Land
-- Coverage — Section 20E Progress"); the per-field labels referencing the
-- Land Acquisition Act's actual Section 20E ("Section 20E Done (Private)"
-- etc.) are untouched — those name a legal section, not the app's tab.

-- Schema: move the land_coverage property from Section20E to AcquisitionDetails.
UPDATE form_definitions
SET schema_json = jsonb_set(
  schema_json #- '{$defs,Section20E,properties,land_coverage}',
  '{$defs,AcquisitionDetails,properties,land_coverage}',
  '{
    "type": "object",
    "title": "Land Coverage Progress",
    "properties": {
      "section_20e_done_private":    {"type": "number", "minimum": 0, "title": "Section 20E Done (Private)"},
      "permission_taken_govt_land":  {"type": "number", "minimum": 0, "title": "Permission Taken by Railway of Govt. Land"},
      "working_permission_obtained": {"type": "number", "minimum": 0, "title": "Working Permission Obtained"}
    }
  }'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

-- ui_schema: drop land_coverage from section_20e's ui:order + field config.
UPDATE form_definitions
SET ui_schema_json = jsonb_set(
  ui_schema_json #- '{section_20e,land_coverage}',
  '{section_20e,ui:order}',
  '["declaration_gazette_published_on", "declaration_gazette_number", "declaration_gazette_pdf",
    "local_newspaper_name", "local_newspaper_pub_date", "local_newspaper_pdf"]'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

-- ui_schema: add land_coverage to acquisition_details's ui:order + field config.
UPDATE form_definitions
SET ui_schema_json = jsonb_set(
  ui_schema_json,
  '{acquisition_details,ui:order}',
  '["record_name","block_section_from","block_section_to","chainage_from","chainage_to",
    "district","sub_division_taluka","area_hectares_private","area_hectares_govt",
    "area_hectares_forest","area_hectares_total","est_villages","land_coverage"]'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

UPDATE form_definitions
SET ui_schema_json = jsonb_set(
  ui_schema_json,
  '{acquisition_details,land_coverage}',
  '{"ui:field": "landCoverage"}'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

-- Data: move any already-entered land_coverage values on existing records from
-- section_20e to acquisition_details so nothing already filled in gets orphaned.
UPDATE activity_records
SET data_json = jsonb_set(
  data_json #- '{section_20e,land_coverage}',
  '{acquisition_details,land_coverage}',
  data_json -> 'section_20e' -> 'land_coverage'
)
WHERE form_definition_id = 'ffffffff-0001-0001-0001-000000000001'
  AND data_json -> 'section_20e' -> 'land_coverage' IS NOT NULL
  AND data_json -> 'section_20e' -> 'land_coverage' != '{}'::jsonb;
