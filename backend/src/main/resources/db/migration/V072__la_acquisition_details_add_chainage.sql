-- V072: Add chainage_from and chainage_to to AcquisitionDetails, after block_section.

-- Step 1: Add fields to $defs.AcquisitionDetails.properties
UPDATE form_definitions
SET schema_json = jsonb_set(
    schema_json,
    '{$defs,AcquisitionDetails,properties,chainage_from}',
    '{"$ref": "#/$defs/Chainage", "title": "Chainage From"}'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

UPDATE form_definitions
SET schema_json = jsonb_set(
    schema_json,
    '{$defs,AcquisitionDetails,properties,chainage_to}',
    '{"$ref": "#/$defs/Chainage", "title": "Chainage To"}'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

-- Step 2: Update ui:order for acquisition_details section
UPDATE form_definitions
SET ui_schema_json = jsonb_set(
    ui_schema_json,
    '{acquisition_details,ui:order}',
    '["record_name","block_section","chainage_from","chainage_to","district","sub_division_taluka",
      "area_hectares_total","area_hectares_private","area_hectares_govt","area_hectares_forest","est_villages"]'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

-- Step 3: Add chainage widget hints inside acquisition_details ui section
UPDATE form_definitions
SET ui_schema_json = jsonb_set(
    ui_schema_json,
    '{acquisition_details,chainage_from}',
    '{"ui:widget": "chainage"}'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

UPDATE form_definitions
SET ui_schema_json = jsonb_set(
    ui_schema_json,
    '{acquisition_details,chainage_to}',
    '{"ui:widget": "chainage"}'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';
