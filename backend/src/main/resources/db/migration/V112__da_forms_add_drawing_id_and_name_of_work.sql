-- V112: Drawing Approval forms — add "Drawing ID" and "Name of Work" to
-- Drawing Details (common to all 23 drawing types), alongside the existing
-- record_name/drawing_type/section/station/initiation_date/other_details/remarks.

UPDATE form_definitions
SET schema_json = jsonb_set(
  schema_json,
  '{$defs,DrawingDetails,properties}',
  (schema_json -> '$defs' -> 'DrawingDetails' -> 'properties') || '{
    "drawing_id":   {"type": "string", "maxLength": 64,  "title": "Drawing ID"},
    "name_of_work": {"type": "string", "maxLength": 256, "title": "Name of Work"}
  }'::jsonb
)
WHERE activity_type_code = 'DRAWING_APPROVAL';

-- Standard forms (everything except ESP and Grade Condonation, which have an
-- extra conditional field inserted after "station").
UPDATE form_definitions
SET ui_schema_json = jsonb_set(
  ui_schema_json,
  '{drawing_details,ui:order}',
  '["record_name","drawing_id","name_of_work","drawing_type","section","station",
    "initiation_date","other_details","remarks"]'::jsonb
)
WHERE activity_type_code = 'DRAWING_APPROVAL'
  AND code NOT IN ('ESP_DRAWING_V1', 'GRADE_CONDONATION_DRAWING_V1');

UPDATE form_definitions
SET ui_schema_json = jsonb_set(
  ui_schema_json,
  '{drawing_details,ui:order}',
  '["record_name","drawing_id","name_of_work","drawing_type","section","station",
    "concept_esp_difference","initiation_date","other_details","remarks"]'::jsonb
)
WHERE code = 'ESP_DRAWING_V1';

UPDATE form_definitions
SET ui_schema_json = jsonb_set(
  ui_schema_json,
  '{drawing_details,ui:order}',
  '["record_name","drawing_id","name_of_work","drawing_type","section","station",
    "curve_details","initiation_date","other_details","remarks"]'::jsonb
)
WHERE code = 'GRADE_CONDONATION_DRAWING_V1';
