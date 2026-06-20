-- V055: Fix V054 which wiped existing TOS properties.
--
-- V054 used schema_json || '{"properties": {...}}'::jsonb which does a shallow
-- merge at the top level — the new "properties" key replaced the old one entirely,
-- losing location, structure_type, and remarks.
--
-- This migration restores the full properties object by merging at the correct
-- depth using jsonb_set(..., '{properties}', existing || new).

UPDATE form_definitions
SET schema_json = jsonb_set(
  schema_json,
  '{properties}',
  (schema_json -> 'properties') || '{
    "record_name":            { "type": "string",  "title": "Record Name",                      "minLength": 1, "maxLength": 256 },
    "office_spaces_required": { "type": "integer", "title": "Number of Office Spaces Required",  "minimum": 1 },
    "block_section":          { "type": "string",  "title": "Block / Section",                   "maxLength": 256 }
  }'::jsonb
)
WHERE code = 'TEMPORARY_OFFICE_SPACE_V1';
