-- V010_001__seed_temporary_office_space_v1.sql
-- Phase 2.2: Seed the TEMPORARY_OFFICE_SPACE_V1 form definition.
--
-- Temporary Office Space is a flat, record-level activity (no sub-sections).
-- It uses RECORD_STANDARD_V1 (a single workflow_instance per record with
-- no sectionCode discriminator).
--
-- The form has a structure_type discriminator with three branches:
--   NEW_REQUIRED  — a new building must be constructed
--   OLD_AVAILABLE — an existing railway building will be used
--   HIRING        — a private building will be hired/leased
--
-- Conditional fields per branch:
--   NEW_REQUIRED:  estimated_cost, construction_start_date,
--                  construction_end_date, contractor_name
--   OLD_AVAILABLE: building_name, building_condition, condition_report_pdf
--   HIRING:        landlord_name, monthly_rent, lease_start_date,
--                  lease_end_date, lease_agreement_pdf
--
-- activity_type_code TEMPORARY_OFFICE_SPACE is seeded in V003_001
-- (display_order = 5, active = true). No new activity type migration needed.

INSERT INTO form_definitions (
    id,
    activity_type_code,
    code,
    version,
    label,
    workflow_definition_id,
    section_codes,
    schema_json,
    ui_schema_json,
    is_active
)
VALUES (
    'ffffffff-0003-0001-0001-000000000001',
    'TEMPORARY_OFFICE_SPACE',
    'TEMPORARY_OFFICE_SPACE_V1',
    1,
    'Temporary Office Space Record v1',
    'bbbbbbbb-0001-0001-0001-000000000001',  -- RECORD_STANDARD_V1
    '{}',                                    -- no sections; flat record-level workflow
    $schema$
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://pia.tracker/schemas/temporary_office_space/TEMPORARY_OFFICE_SPACE_V1/1.json",
  "type": "object",
  "title": "Temporary Office Space Record",
  "description": "Site office setup for the construction phase. Three structure-type branches with conditional fields.",
  "required": ["structure_type", "location_description"],
  "additionalProperties": false,
  "properties": {
    "structure_type":         { "type": "string",  "title": "Structure Type",           "enum": ["NEW_REQUIRED", "OLD_AVAILABLE", "HIRING"] },
    "location_description":  { "type": "string",  "title": "Location Description",     "minLength": 1, "maxLength": 512 },
    "area_sqm":              { "type": "number",  "title": "Floor Area (sq.m)",         "minimum": 0 },
    "purpose":               { "type": "string",  "title": "Purpose / Use",             "maxLength": 256 },

    "estimated_cost":           { "type": "number",  "title": "Estimated Cost (₹)",        "minimum": 0 },
    "construction_start_date":  { "type": "string",  "title": "Construction Start Date",   "format": "date" },
    "construction_end_date":    { "type": "string",  "title": "Construction End Date",      "format": "date" },
    "contractor_name":          { "type": "string",  "title": "Contractor Name",            "maxLength": 256 },

    "building_name":            { "type": "string",  "title": "Building Name / Number",    "maxLength": 256 },
    "building_condition":       { "type": "string",  "title": "Condition of Building",      "enum": ["GOOD", "FAIR", "POOR"] },
    "condition_report_pdf":     { "type": "string",  "title": "Condition Report PDF",       "format": "uuid" },

    "landlord_name":            { "type": "string",  "title": "Landlord / Owner Name",     "maxLength": 256 },
    "monthly_rent":             { "type": "number",  "title": "Monthly Rent (₹)",          "minimum": 0 },
    "lease_start_date":         { "type": "string",  "title": "Lease Start Date",           "format": "date" },
    "lease_end_date":           { "type": "string",  "title": "Lease End Date",             "format": "date" },
    "lease_agreement_pdf":      { "type": "string",  "title": "Lease Agreement PDF",        "format": "uuid" },

    "remarks":                  { "type": "string",  "title": "Remarks" }
  },
  "allOf": [
    {
      "if":   { "properties": { "structure_type": { "const": "NEW_REQUIRED" } }, "required": ["structure_type"] },
      "then": { "required": ["estimated_cost", "construction_start_date", "construction_end_date"] }
    },
    {
      "if":   { "properties": { "structure_type": { "const": "OLD_AVAILABLE" } }, "required": ["structure_type"] },
      "then": { "required": ["building_name", "building_condition"] }
    },
    {
      "if":   { "properties": { "structure_type": { "const": "HIRING" } }, "required": ["structure_type"] },
      "then": { "required": ["landlord_name", "monthly_rent", "lease_start_date", "lease_end_date"] }
    }
  ]
}
$schema$::jsonb,
    $uischema$
{
  "ui:order": [
    "structure_type",
    "location_description",
    "area_sqm",
    "purpose",
    "estimated_cost",
    "construction_start_date",
    "construction_end_date",
    "contractor_name",
    "building_name",
    "building_condition",
    "condition_report_pdf",
    "landlord_name",
    "monthly_rent",
    "lease_start_date",
    "lease_end_date",
    "lease_agreement_pdf",
    "remarks"
  ],
  "location_description":  { "ui:widget": "textarea" },
  "remarks":               { "ui:widget": "textarea" },
  "condition_report_pdf":  { "ui:widget": "attachment" },
  "lease_agreement_pdf":   { "ui:widget": "attachment" },
  "structure_type": {
    "ui:widget": "select",
    "ui:enumNames": ["New Construction Required", "Existing Railway Building Available", "Hiring / Leasing"]
  }
}
$uischema$::jsonb,
    true
);
