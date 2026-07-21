-- V116: Section 20E — add a "Land Coverage" progress block: Private/Govt/Forest
-- Land are live-fetched from this same record's Acquisition Details section
-- (not duplicated into section_20e's own data), alongside three user-entered
-- "done"/"permission" figures. Total Land, Section E Done, and % Section E
-- Done are computed live in the UI from those six values (Done/Total*100) —
-- not stored, so they can never drift from their inputs.
--
-- Rendered by the custom landCoverage RJSF field (frontend), registered via
-- ui:field, since it needs cross-section data (Acquisition Details) that a
-- plain schema property can't reach.

UPDATE form_definitions
SET schema_json = jsonb_set(
  schema_json,
  '{$defs,Section20E,properties,land_coverage}',
  '{
    "type": "object",
    "title": "Land Coverage — Section 20E Progress",
    "properties": {
      "section_20e_done_private":    {"type": "number", "minimum": 0, "title": "Section 20E Done (Private)"},
      "permission_taken_govt_land":  {"type": "number", "minimum": 0, "title": "Permission Taken by Railway of Govt. Land"},
      "working_permission_obtained": {"type": "number", "minimum": 0, "title": "Working Permission Obtained"}
    }
  }'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

UPDATE form_definitions
SET ui_schema_json = jsonb_set(
  ui_schema_json,
  '{section_20e,ui:order}',
  '["declaration_gazette_published_on", "declaration_gazette_number", "declaration_gazette_pdf",
    "local_newspaper_name", "local_newspaper_pub_date", "local_newspaper_pdf", "land_coverage"]'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

UPDATE form_definitions
SET ui_schema_json = jsonb_set(
  ui_schema_json,
  '{section_20e,land_coverage}',
  '{"ui:field": "landCoverage"}'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';
