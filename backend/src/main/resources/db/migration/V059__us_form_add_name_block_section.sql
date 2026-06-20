-- V059: Add record_name and block_section before other fields in UTILITY_SHIFTING_V1 form.

UPDATE form_definitions
SET
  schema_json = jsonb_set(
    schema_json,
    '{properties}',
    (schema_json -> 'properties') || '{
      "record_name":  { "type": "string", "title": "Record Name",    "minLength": 1, "maxLength": 256 },
      "block_section":{ "type": "string", "title": "Block / Section", "maxLength": 256 }
    }'::jsonb
  ),
  ui_schema_json = jsonb_set(
    ui_schema_json,
    '{ui:order}',
    (
      SELECT jsonb_build_array('record_name', 'block_section') ||
             jsonb_agg(elem ORDER BY idx)
      FROM jsonb_array_elements(ui_schema_json -> 'ui:order') WITH ORDINALITY AS t(elem, idx)
      WHERE elem NOT IN ('"record_name"'::jsonb, '"block_section"'::jsonb)
    )
  )
WHERE code = 'UTILITY_SHIFTING_V1';
