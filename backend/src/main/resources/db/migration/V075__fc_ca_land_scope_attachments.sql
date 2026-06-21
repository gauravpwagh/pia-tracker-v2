-- V075: Add scopeToField:true to CA Land attachment widgets so each field
-- has its own isolated attachment pool (entityId = recordId__fieldPath).

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
