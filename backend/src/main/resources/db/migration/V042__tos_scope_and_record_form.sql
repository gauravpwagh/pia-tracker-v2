-- V042: Temporary Office Space — scope column + per-office record form.
--
-- 1. Add total_count (scope) to temporary_office_space_details
-- 2. Update TEMPORARY_OFFICE_SPACE_V1 form with per-office fields

ALTER TABLE temporary_office_space_details
  ADD COLUMN IF NOT EXISTS total_count INTEGER;

UPDATE form_definitions
SET
  activity_type_code = 'TEMPORARY_OFFICE_SPACE',
  label              = 'Temporary Office Space Record',
  schema_json        = '{
    "type": "object",
    "title": "Temporary Office Space Record",
    "description": "One record per office space required.",
    "required": ["structure_type"],
    "additionalProperties": false,
    "properties": {
      "structure_type":          { "type": "string",  "title": "Structure Type",            "enum": ["NEW_REQUIRED", "OLD_AVAILABLE", "HIRING"] },
      "location_description":    { "type": "string",  "title": "Location Description",      "maxLength": 512 },
      "area_sqm":                { "type": "number",  "title": "Area Required (sqm)",       "minimum": 0 },
      "new_agency_available":    { "type": "boolean", "title": "Agency Available?" },
      "new_tdc":                 { "type": "string",  "title": "Target Date of Completion", "format": "date" },
      "old_possession_given":    { "type": "boolean", "title": "Possession Given by OL?" },
      "old_tdc":                 { "type": "string",  "title": "Target Date of Completion", "format": "date" },
      "hiring_rental_agreement": { "type": "boolean", "title": "Rental Agreement Signed?" },
      "hiring_tdc":              { "type": "string",  "title": "Target Date of Completion", "format": "date" },
      "remarks":                 { "type": "string",  "title": "Remarks" }
    }
  }'::jsonb,
  ui_schema_json = '{
    "ui:order": [
      "structure_type", "location_description", "area_sqm",
      "new_agency_available", "new_tdc",
      "old_possession_given", "old_tdc",
      "hiring_rental_agreement", "hiring_tdc",
      "remarks"
    ],
    "structure_type": {
      "ui:widget": "select",
      "ui:enumNames": ["New Structure Required", "Old Structure Available", "Hiring / Rent"]
    },
    "new_agency_available":    {},
    "old_possession_given":    {},
    "hiring_rental_agreement": {},
    "new_tdc":                 { "ui:widget": "date" },
    "old_tdc":                 { "ui:widget": "date" },
    "hiring_tdc":              { "ui:widget": "date" },
    "location_description":    { "ui:widget": "textarea" },
    "remarks":                 { "ui:widget": "textarea" }
  }'::jsonb,
  is_active = true
WHERE code = 'TEMPORARY_OFFICE_SPACE_V1';
