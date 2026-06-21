-- V073: Add Acquisition Details as first section of FOREST_CLEARANCE_V1 form.
-- Fields: record_name, block_section, chainage_from, chainage_to, forest_division, forest_area
-- Replaces root-level forest_division_name, forest_area_hectares, project_chainage_from/to.

-- Step 1: Add AcquisitionDetails $def
UPDATE form_definitions
SET schema_json = jsonb_set(
    schema_json,
    '{$defs,AcquisitionDetails}',
    '{
      "type": "object",
      "title": "Acquisition Details",
      "additionalProperties": false,
      "properties": {
        "record_name":     { "type": "string", "title": "Record Name", "minLength": 1, "maxLength": 256 },
        "block_section":   { "type": "string", "title": "Block Section", "maxLength": 256 },
        "chainage_from":   { "$ref": "#/$defs/Chainage", "title": "Chainage From" },
        "chainage_to":     { "$ref": "#/$defs/Chainage", "title": "Chainage To" },
        "forest_division": { "type": "string", "title": "Forest Division", "minLength": 1, "maxLength": 256 },
        "forest_area":     { "type": "number", "title": "Forest Area (ha)", "minimum": 0 }
      }
    }'::jsonb
)
WHERE id = 'ffffffff-0005-0001-0001-000000000001';

-- Step 2: Add acquisition_details property at root
UPDATE form_definitions
SET schema_json = jsonb_set(
    schema_json,
    '{properties,acquisition_details}',
    '{"$ref": "#/$defs/AcquisitionDetails"}'::jsonb
)
WHERE id = 'ffffffff-0005-0001-0001-000000000001';

-- Step 3: Remove old root-level properties that now live in acquisition_details
UPDATE form_definitions
SET schema_json = schema_json
    #- '{properties,forest_division_name}'
    #- '{properties,forest_area_hectares}'
    #- '{properties,project_chainage_from}'
    #- '{properties,project_chainage_to}'
    #- '{required}'
WHERE id = 'ffffffff-0005-0001-0001-000000000001';

-- Step 4: Prepend acquisition_details to section_codes
UPDATE form_definitions
SET section_codes = ARRAY['acquisition_details'] || section_codes
WHERE id = 'ffffffff-0005-0001-0001-000000000001';

-- Step 5: Update root ui:order (remove old root fields, prepend acquisition_details)
UPDATE form_definitions
SET ui_schema_json = jsonb_set(
    ui_schema_json,
    '{ui:order}',
    '["acquisition_details","stage_i","stage_ii","post_approval"]'::jsonb
)
WHERE id = 'ffffffff-0005-0001-0001-000000000001';

-- Step 6: Remove old root chainage widget hints
UPDATE form_definitions
SET ui_schema_json = ui_schema_json
    #- '{project_chainage_from}'
    #- '{project_chainage_to}'
WHERE id = 'ffffffff-0005-0001-0001-000000000001';

-- Step 7: Add acquisition_details ui schema section
UPDATE form_definitions
SET ui_schema_json = jsonb_set(
    ui_schema_json,
    '{acquisition_details}',
    '{
      "ui:title": "Acquisition Details",
      "ui:order": ["record_name","block_section","chainage_from","chainage_to","forest_division","forest_area"],
      "chainage_from": { "ui:widget": "chainage" },
      "chainage_to":   { "ui:widget": "chainage" }
    }'::jsonb
)
WHERE id = 'ffffffff-0005-0001-0001-000000000001';

-- Step 8: Migrate existing record data — move root fields into acquisition_details sub-object
UPDATE activity_records
SET data_json = (
    (data_json
        - 'forest_division_name'
        - 'forest_area_hectares'
        - 'project_chainage_from'
        - 'project_chainage_to'
    ) || jsonb_build_object(
        'acquisition_details',
        jsonb_strip_nulls(jsonb_build_object(
            'forest_division', data_json -> 'forest_division_name',
            'forest_area',     data_json -> 'forest_area_hectares',
            'chainage_from',   data_json -> 'project_chainage_from',
            'chainage_to',     data_json -> 'project_chainage_to'
        ))
    )
)
WHERE form_definition_id = 'ffffffff-0005-0001-0001-000000000001'
  AND data_json -> 'acquisition_details' IS NULL;
