-- V058: Add 'No. of Tender Packages Required' after package_name in TP form.

UPDATE form_definitions
SET
  schema_json = jsonb_set(
    schema_json,
    '{properties}',
    (schema_json -> 'properties') || '{
      "packages_required": { "type": "integer", "title": "No. of Tender Packages Required", "minimum": 1 }
    }'::jsonb
  ),
  ui_schema_json = jsonb_set(
    ui_schema_json,
    '{ui:order}',
    '["package_name", "packages_required", "block_section", "epc_document_prepared", "tender_finalized"]'::jsonb
  )
WHERE code = 'TENDER_PACKAGING_V1';
