-- V076: Add Checklist section to FOREST_CLEARANCE_V1 form, after CA Land.
-- Fields: project_report, forest_area_statement, dgps_survey, gis_overlay, fra_compliance (all attachments).

-- Step 1: Add Checklist $def
UPDATE form_definitions
SET schema_json = jsonb_set(
    schema_json,
    '{$defs,Checklist}',
    '{
      "type": "object",
      "title": "Checklist",
      "additionalProperties": false,
      "properties": {
        "project_report":          { "type": "string", "format": "uuid", "title": "Project Report" },
        "forest_area_statement":   { "type": "string", "format": "uuid", "title": "Forest Area Statement" },
        "dgps_survey":             { "type": "string", "format": "uuid", "title": "DGPS Survey of Forest Land" },
        "gis_overlay":             { "type": "string", "format": "uuid", "title": "GIS Overlay with Forest Map" },
        "fra_compliance":          { "type": "string", "format": "uuid", "title": "FRA Compliance" }
      }
    }'::jsonb
)
WHERE id = 'ffffffff-0005-0001-0001-000000000001';

-- Step 2: Add checklist property at root
UPDATE form_definitions
SET schema_json = jsonb_set(
    schema_json,
    '{properties,checklist}',
    '{"$ref": "#/$defs/Checklist"}'::jsonb
)
WHERE id = 'ffffffff-0005-0001-0001-000000000001';

-- Step 3: Insert checklist between ca_land and post_approval in section_codes
UPDATE form_definitions
SET section_codes = ARRAY['acquisition_details','stage_i','stage_ii','ca_land','checklist','post_approval']
WHERE id = 'ffffffff-0005-0001-0001-000000000001';

-- Step 4: Update root ui:order
UPDATE form_definitions
SET ui_schema_json = jsonb_set(
    ui_schema_json,
    '{ui:order}',
    '["acquisition_details","stage_i","stage_ii","ca_land","checklist","post_approval"]'::jsonb
)
WHERE id = 'ffffffff-0005-0001-0001-000000000001';

-- Step 5: Add checklist ui schema with scopeToField:true on all 5 attachment fields
UPDATE form_definitions
SET ui_schema_json = jsonb_set(
    ui_schema_json,
    '{checklist}',
    '{
      "ui:title": "Checklist",
      "ui:order": ["project_report","forest_area_statement","dgps_survey","gis_overlay","fra_compliance"],
      "project_report":        { "ui:widget": "attachment", "ui:options": { "scopeToField": true } },
      "forest_area_statement": { "ui:widget": "attachment", "ui:options": { "scopeToField": true } },
      "dgps_survey":           { "ui:widget": "attachment", "ui:options": { "scopeToField": true } },
      "gis_overlay":           { "ui:widget": "attachment", "ui:options": { "scopeToField": true } },
      "fra_compliance":        { "ui:widget": "attachment", "ui:options": { "scopeToField": true } }
    }'::jsonb
)
WHERE id = 'ffffffff-0005-0001-0001-000000000001';
