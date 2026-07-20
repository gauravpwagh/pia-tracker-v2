-- V114: Utility Shifting — add optional "Attach Drawing" field (PDF/Word or a
-- scanned image of the crossing/infringement drawing). Not in `required`, so
-- it stays optional.

UPDATE form_definitions
SET schema_json = jsonb_set(
  schema_json,
  '{properties,drawing_attachment}',
  '{"type": "string", "format": "uuid", "title": "Attach Drawing (Optional)"}'::jsonb
)
WHERE code = 'UTILITY_SHIFTING_V1';

UPDATE form_definitions
SET ui_schema_json = jsonb_set(
  ui_schema_json,
  '{ui:order}',
  '["record_name","block_section_from","block_section_to",
    "utility_type","owner_agency",
    "chainage_from","chainage_to","length_affected_km",
    "executing_agency",
    "estimate_position","fund_submission",
    "material_available","agency_available",
    "status_drawing_execution","target_removal_date",
    "consent_state_govt","infringement_media","drawing_attachment","remarks"]'::jsonb
)
WHERE code = 'UTILITY_SHIFTING_V1';

UPDATE form_definitions
SET ui_schema_json = jsonb_set(
  ui_schema_json,
  '{drawing_attachment}',
  '{
    "ui:widget": "attachment",
    "ui:options": {
      "scopeToField": true,
      "accept": "application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/jpeg,image/png,image/tiff,image/geo+tiff,image/geotiff",
      "uploadLabel": "Attach drawing",
      "uploadHint": "PDF · Word · Image — optional"
    }
  }'::jsonb
)
WHERE code = 'UTILITY_SHIFTING_V1';
