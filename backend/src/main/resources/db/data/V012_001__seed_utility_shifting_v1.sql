-- V012_001__seed_utility_shifting_v1.sql
-- Phase 2.3: Seed the UTILITY_SHIFTING_V1 form definition.
--
-- Utility Shifting is a flat, record-level activity (no sub-sections).
-- It uses RECORD_STANDARD_V1 (a single workflow_instance per record with
-- no sectionCode discriminator).
--
-- The utility_type field acts as the in-form discriminator.  The DB-level
-- discriminator is activity_records.record_subtype, which is set at record
-- creation time to the same value by the client.
--
-- Utility types supported:
--   OVERHEAD_LINE  — OHT / overhead electrical lines
--   WATER_PIPELINE — water supply / irrigation pipelines
--   NALA           — drainage channel / nala diversion
--   TELECOM_CABLE  — telecom / optical-fibre cables
--   GAS_PIPELINE   — gas distribution pipelines
--
-- Conditional fields per type (allOf if/then):
--   OVERHEAD_LINE:  pole_count, span_length_m, agency_name
--   WATER_PIPELINE: pipe_diameter_mm, length_m, agency_name
--   NALA:           nala_width_m, nala_length_m, revetment_type
--   TELECOM_CABLE:  cable_length_m, cable_type, agency_name
--   GAS_PIPELINE:   pipe_diameter_mm, length_m, agency_name
--
-- activity_type_code UTILITY_SHIFTING is seeded in V003_001
-- (display_order = 2, active = true). No new activity type migration needed.

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
    'ffffffff-0004-0001-0001-000000000001',
    'UTILITY_SHIFTING',
    'UTILITY_SHIFTING_V1',
    1,
    'Utility Shifting Record v1',
    'bbbbbbbb-0001-0001-0001-000000000001',  -- RECORD_STANDARD_V1
    '{}',                                    -- no sections; flat record-level workflow
    $schema$
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://pia.tracker/schemas/utility_shifting/UTILITY_SHIFTING_V1/1.json",
  "type": "object",
  "title": "Utility Shifting Record",
  "description": "Per-utility shifting record. The utility_type discriminator selects the relevant conditional fields.",
  "required": ["utility_type", "location_description", "chainage_from", "chainage_to"],
  "additionalProperties": false,
  "properties": {
    "utility_type":         { "type": "string",  "title": "Utility Type",           "enum": ["OVERHEAD_LINE", "WATER_PIPELINE", "NALA", "TELECOM_CABLE", "GAS_PIPELINE"] },
    "location_description": { "type": "string",  "title": "Location Description",   "minLength": 1, "maxLength": 512 },
    "chainage_from":        { "type": "string",  "title": "Chainage From",          "pattern": "^[0-9]+\\+[0-9]{3}$" },
    "chainage_to":          { "type": "string",  "title": "Chainage To",            "pattern": "^[0-9]+\\+[0-9]{3}$" },
    "work_order_no":        { "type": "string",  "title": "Work Order No.",         "maxLength": 128 },
    "work_completed_on":    { "type": "string",  "title": "Work Completed On",      "format": "date" },
    "completion_cert_pdf":  { "type": "string",  "title": "Completion Certificate", "format": "uuid" },

    "pole_count":           { "type": "integer", "title": "No. of Poles",           "minimum": 0 },
    "span_length_m":        { "type": "number",  "title": "Span Length (m)",        "minimum": 0 },

    "pipe_diameter_mm":     { "type": "number",  "title": "Pipe Diameter (mm)",     "minimum": 0 },
    "length_m":             { "type": "number",  "title": "Length Shifted (m)",     "minimum": 0 },

    "nala_width_m":         { "type": "number",  "title": "Nala Width (m)",         "minimum": 0 },
    "nala_length_m":        { "type": "number",  "title": "Nala Length (m)",        "minimum": 0 },
    "revetment_type":       { "type": "string",  "title": "Revetment Type",         "maxLength": 128 },

    "cable_length_m":       { "type": "number",  "title": "Cable Length (m)",       "minimum": 0 },
    "cable_type":           { "type": "string",  "title": "Cable Type",             "maxLength": 128 },

    "agency_name":          { "type": "string",  "title": "Executing Agency",       "maxLength": 256 },
    "remarks":              { "type": "string",  "title": "Remarks" }
  },
  "allOf": [
    {
      "if":   { "properties": { "utility_type": { "const": "OVERHEAD_LINE" } }, "required": ["utility_type"] },
      "then": { "required": ["pole_count"] }
    },
    {
      "if":   { "properties": { "utility_type": { "const": "WATER_PIPELINE" } }, "required": ["utility_type"] },
      "then": { "required": ["pipe_diameter_mm", "length_m"] }
    },
    {
      "if":   { "properties": { "utility_type": { "const": "NALA" } }, "required": ["utility_type"] },
      "then": { "required": ["nala_width_m", "nala_length_m"] }
    },
    {
      "if":   { "properties": { "utility_type": { "const": "TELECOM_CABLE" } }, "required": ["utility_type"] },
      "then": { "required": ["cable_length_m"] }
    },
    {
      "if":   { "properties": { "utility_type": { "const": "GAS_PIPELINE" } }, "required": ["utility_type"] },
      "then": { "required": ["pipe_diameter_mm", "length_m"] }
    }
  ]
}
$schema$::jsonb,
    $uischema$
{
  "ui:order": [
    "utility_type",
    "location_description",
    "chainage_from",
    "chainage_to",
    "work_order_no",
    "work_completed_on",
    "completion_cert_pdf",
    "pole_count",
    "span_length_m",
    "pipe_diameter_mm",
    "length_m",
    "nala_width_m",
    "nala_length_m",
    "revetment_type",
    "cable_length_m",
    "cable_type",
    "agency_name",
    "remarks"
  ],
  "utility_type": {
    "ui:widget": "select",
    "ui:enumNames": [
      "Overhead Line (OHT)",
      "Water Pipeline",
      "Nala / Drainage Channel",
      "Telecom / Fibre Cable",
      "Gas Pipeline"
    ]
  },
  "location_description": { "ui:widget": "textarea" },
  "chainage_from":        { "ui:widget": "chainage" },
  "chainage_to":          { "ui:widget": "chainage" },
  "completion_cert_pdf":  { "ui:widget": "attachment" },
  "remarks":              { "ui:widget": "textarea" }
}
$uischema$::jsonb,
    true
);
