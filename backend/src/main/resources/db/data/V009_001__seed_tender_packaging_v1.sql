-- V009_001__seed_tender_packaging_v1.sql
-- Phase 2.1: Seed the TENDER_PACKAGING_V1 form definition.
--
-- Tender Packaging is a flat, record-level activity (no sub-sections).
-- It uses RECORD_STANDARD_V1 (a single workflow_instance per record with
-- no sectionCode discriminator).
--
-- Key decisions:
--   • workflow_definition_id = RECORD_STANDARD_V1  (bbbbbbbb-0001-0001-0001-000000000001)
--   • section_codes = '{}'  (empty — record-level workflow; no section tabs)
--   • Conditional schema: if tender_finalized = true → tender_finalization_date required
--                         if epc_document_prepared = true → epc_document_pdf required
--
-- activity_type_code TENDER_PACKAGING is seeded in V003_001 (display_order = 4, active = true).
-- No new activity type migration is needed.

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
    'ffffffff-0002-0001-0001-000000000001',
    'TENDER_PACKAGING',
    'TENDER_PACKAGING_V1',
    1,
    'Tender Packaging Record v1',
    'bbbbbbbb-0001-0001-0001-000000000001',  -- RECORD_STANDARD_V1
    '{}',                                    -- no sections; flat record-level workflow
    $schema$
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://pia.tracker/schemas/tender_packaging/TENDER_PACKAGING_V1/1.json",
  "type": "object",
  "title": "Tender Packaging Record",
  "description": "Tender preparation and NIT publication tracking. Flat record — no sections.",
  "required": ["package_name", "scope_description"],
  "additionalProperties": false,
  "properties": {
    "package_name":             { "type": "string",  "title": "Package Name",              "minLength": 1, "maxLength": 256 },
    "scope_description":        { "type": "string",  "title": "Scope of Work",             "minLength": 1 },
    "estimated_value":          { "type": "number",  "title": "Estimated Value (₹)",       "minimum": 0 },
    "epc_document_prepared":    { "type": "boolean", "title": "EPC Document Prepared?" },
    "epc_document_pdf":         { "type": "string",  "title": "EPC Document PDF",          "format": "uuid" },
    "tender_finalized":         { "type": "boolean", "title": "Tender Finalized?" },
    "tender_finalization_date": { "type": "string",  "title": "Tender Finalization Date",  "format": "date" },
    "nit_published_on":         { "type": "string",  "title": "NIT Published On",          "format": "date" },
    "tender_id":                { "type": "string",  "title": "Tender ID / Reference",     "maxLength": 128 },
    "remarks":                  { "type": "string",  "title": "Remarks" }
  },
  "if":   { "properties": { "tender_finalized":      { "const": true } }, "required": ["tender_finalized"] },
  "then": { "required": ["tender_finalization_date"] },
  "allOf": [
    {
      "if":   { "properties": { "epc_document_prepared": { "const": true } }, "required": ["epc_document_prepared"] },
      "then": { "required": ["epc_document_pdf"] }
    }
  ]
}
$schema$::jsonb,
    $uischema$
{
  "ui:order": [
    "package_name",
    "scope_description",
    "estimated_value",
    "epc_document_prepared",
    "epc_document_pdf",
    "tender_finalized",
    "tender_finalization_date",
    "nit_published_on",
    "tender_id",
    "remarks"
  ],
  "epc_document_pdf":         { "ui:widget": "attachment" },
  "scope_description":        { "ui:widget": "textarea" },
  "remarks":                  { "ui:widget": "textarea" }
}
$uischema$::jsonb,
    true
);
