-- V074: Add CA Land section to FOREST_CLEARANCE_V1 form, between Stage II and Post Approval.
-- Fields: area_selection, village_map, topo_sheet, kml_file, geo_reference_map (all attachments).

-- Step 1: Add CALand $def
UPDATE form_definitions
SET schema_json = jsonb_set(
    schema_json,
    '{$defs,CALand}',
    '{
      "type": "object",
      "title": "CA Land",
      "additionalProperties": false,
      "properties": {
        "area_selection":    { "type": "string", "format": "uuid", "title": "Area Selection" },
        "village_map":       { "type": "string", "format": "uuid", "title": "Village Map" },
        "topo_sheet":        { "type": "string", "format": "uuid", "title": "TOPO Sheet" },
        "kml_file":          { "type": "string", "format": "uuid", "title": "KML File" },
        "geo_reference_map": { "type": "string", "format": "uuid", "title": "Geo Reference Map" }
      }
    }'::jsonb
)
WHERE id = 'ffffffff-0005-0001-0001-000000000001';

-- Step 2: Add ca_land property at root
UPDATE form_definitions
SET schema_json = jsonb_set(
    schema_json,
    '{properties,ca_land}',
    '{"$ref": "#/$defs/CALand"}'::jsonb
)
WHERE id = 'ffffffff-0005-0001-0001-000000000001';

-- Step 3: Insert ca_land between stage_ii and post_approval in section_codes
UPDATE form_definitions
SET section_codes = ARRAY['acquisition_details','stage_i','stage_ii','ca_land','post_approval']
WHERE id = 'ffffffff-0005-0001-0001-000000000001';

-- Step 4: Update root ui:order
UPDATE form_definitions
SET ui_schema_json = jsonb_set(
    ui_schema_json,
    '{ui:order}',
    '["acquisition_details","stage_i","stage_ii","ca_land","post_approval"]'::jsonb
)
WHERE id = 'ffffffff-0005-0001-0001-000000000001';

-- Step 5: Add ca_land ui schema with scoped attachment widgets.
-- scopeToField:true appends the field path to entityId so each field has its own attachment pool.
UPDATE form_definitions
SET ui_schema_json = jsonb_set(
    ui_schema_json,
    '{ca_land}',
    '{
      "ui:title": "CA Land",
      "ui:order": ["area_selection","village_map","topo_sheet","kml_file","geo_reference_map"],
      "area_selection":    { "ui:widget": "attachment", "ui:options": { "scopeToField": true } },
      "village_map":       { "ui:widget": "attachment", "ui:options": { "scopeToField": true } },
      "topo_sheet":        { "ui:widget": "attachment", "ui:options": { "scopeToField": true } },
      "kml_file":          { "ui:widget": "attachment", "ui:options": { "scopeToField": true } },
      "geo_reference_map": { "ui:widget": "attachment", "ui:options": { "scopeToField": true } }
    }'::jsonb
)
WHERE id = 'ffffffff-0005-0001-0001-000000000001';
