-- V057: Simplify TENDER_PACKAGING_V1 form to 4 fields.
--   1. Package Name  (synced to activity_records.name)
--   2. Block / Section
--   3. Preparation of EPC Document  (Yes/No)
--   4. Finalization of EPC Tender   (Yes/No)

UPDATE form_definitions
SET
  schema_json = '{
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://pia.tracker/schemas/tender_packaging/TENDER_PACKAGING_V1/2.json",
    "type": "object",
    "title": "Tender Packaging Record",
    "required": ["package_name"],
    "properties": {
      "package_name":          { "type": "string",  "title": "Package Name",                   "minLength": 1, "maxLength": 256 },
      "block_section":         { "type": "string",  "title": "Block / Section",                "maxLength": 256 },
      "epc_document_prepared": { "type": "boolean", "title": "Preparation of EPC Document" },
      "tender_finalized":      { "type": "boolean", "title": "Finalization of EPC Tender" }
    }
  }'::jsonb,
  ui_schema_json = '{
    "ui:order": [
      "package_name",
      "block_section",
      "epc_document_prepared",
      "tender_finalized"
    ],
    "epc_document_prepared": { "ui:widget": "radio" },
    "tender_finalized":      { "ui:widget": "radio" }
  }'::jsonb
WHERE code = 'TENDER_PACKAGING_V1';
