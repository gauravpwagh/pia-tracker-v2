-- V054: Add record_name, office_spaces_required, block_section to TOS form.
--
-- These three fields appear before location in the form order.
-- record_name is synced to activity_records.name by RecordEditPage on save.

UPDATE form_definitions
SET
  schema_json = schema_json
    || '{"properties": {
      "record_name":            { "type": "string",  "title": "Record Name",                     "minLength": 1, "maxLength": 256 },
      "office_spaces_required": { "type": "integer", "title": "Number of Office Spaces Required", "minimum": 1 },
      "block_section":          { "type": "string",  "title": "Block / Section",                  "maxLength": 256 }
    }}'::jsonb,
  ui_schema_json = jsonb_set(
    ui_schema_json,
    '{ui:order}',
    '["record_name", "office_spaces_required", "block_section", "location", "structure_type",
      "agency_available", "possession_given", "rental_agreement", "tdc", "remarks"]'::jsonb
  )
WHERE code = 'TEMPORARY_OFFICE_SPACE_V1';
