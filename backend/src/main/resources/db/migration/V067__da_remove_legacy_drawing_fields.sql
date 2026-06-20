-- V067: Remove legacy fields from $defs.DrawingDetails that are not in the
-- user spec: chainage_from, chainage_to, description, revision, drawing_number.
-- Update ui:order for all forms accordingly.
-- Special cases: ESP and Grade Condonation keep their conditional field.

-- ── Step 1: Remove legacy properties from DrawingDetails for all DA forms ─────

UPDATE form_definitions
SET schema_json = jsonb_set(
  schema_json,
  '{$defs,DrawingDetails,properties}',
  (schema_json -> '$defs' -> 'DrawingDetails' -> 'properties')
    - 'chainage_from'
    - 'chainage_to'
    - 'description'
    - 'revision'
    - 'drawing_number'
)
WHERE activity_type_code = 'DRAWING_APPROVAL';

-- ── Step 2: Update ui:order — standard forms (no conditional field) ────────────

UPDATE form_definitions
SET ui_schema_json = jsonb_set(
  ui_schema_json,
  '{drawing_details,ui:order}',
  '["record_name","drawing_type","section","station","initiation_date","other_details","remarks"]'::jsonb
)
WHERE activity_type_code = 'DRAWING_APPROVAL'
  AND code NOT IN ('ESP_DRAWING_V1', 'GRADE_CONDONATION_DRAWING_V1');

-- ── Step 3: ESP — keep concept_esp_difference in order ────────────────────────

UPDATE form_definitions
SET ui_schema_json = jsonb_set(
  ui_schema_json,
  '{drawing_details,ui:order}',
  '["record_name","drawing_type","section","station","concept_esp_difference","initiation_date","other_details","remarks"]'::jsonb
)
WHERE code = 'ESP_DRAWING_V1';

-- ── Step 4: Grade Condonation — keep curve_details in order ───────────────────

UPDATE form_definitions
SET ui_schema_json = jsonb_set(
  ui_schema_json,
  '{drawing_details,ui:order}',
  '["record_name","drawing_type","section","station","curve_details","initiation_date","other_details","remarks"]'::jsonb
)
WHERE code = 'GRADE_CONDONATION_DRAWING_V1';

-- ── Step 5: Also remove chainage widget hints from ui_schema (clean up) ────────

UPDATE form_definitions
SET ui_schema_json = jsonb_set(
  ui_schema_json,
  '{drawing_details}',
  (ui_schema_json -> 'drawing_details')
    - 'chainage_from'
    - 'chainage_to'
    - 'description'
    - 'revision'
    - 'drawing_number'
)
WHERE activity_type_code = 'DRAWING_APPROVAL';
