-- V056: Restore location, structure_type, remarks which were lost in V054.

UPDATE form_definitions
SET schema_json = jsonb_set(
  schema_json,
  '{properties}',
  (schema_json -> 'properties') || '{
    "location":       { "type": "string", "title": "Location",          "minLength": 1, "maxLength": 512 },
    "structure_type": { "type": "string", "title": "Type of Structure", "enum": ["NEW_REQUIRED", "OLD_AVAILABLE", "HIRING"] },
    "remarks":        { "type": "string", "title": "Remarks" }
  }'::jsonb
)
WHERE code = 'TEMPORARY_OFFICE_SPACE_V1';
