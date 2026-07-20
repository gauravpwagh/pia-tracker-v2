-- V113: Utility Shifting — add "Photos and Video of Infringement" attachment
-- field. Video upload is deliberately disabled for now (accept list is images
-- only); re-enabling video later is just widening ui:options.accept to include
-- ACCEPT_VIDEO's MIME types, no schema change needed.

UPDATE form_definitions
SET schema_json = jsonb_set(
  schema_json,
  '{properties,infringement_media}',
  '{"type": "string", "format": "uuid", "title": "Photos and Video of Infringement"}'::jsonb
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
    "consent_state_govt","infringement_media","remarks"]'::jsonb
)
WHERE code = 'UTILITY_SHIFTING_V1';

UPDATE form_definitions
SET ui_schema_json = jsonb_set(
  ui_schema_json,
  '{infringement_media}',
  '{
    "ui:widget": "attachment",
    "ui:options": {
      "scopeToField": true,
      "accept": "image/jpeg,image/png,image/tiff,image/geo+tiff,image/geotiff",
      "uploadLabel": "Attach photo",
      "uploadHint": "Photos only for now — video upload will be enabled later"
    }
  }'::jsonb
)
WHERE code = 'UTILITY_SHIFTING_V1';
