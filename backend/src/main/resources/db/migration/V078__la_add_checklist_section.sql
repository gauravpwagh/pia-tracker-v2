-- V078: Add Checklist section to LAND_ACQUISITION_V1 form, after section_20h_i.
-- Fields: kmz_file, drone_footage, srp_notification, cala_nomination (all attachments).

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
        "kmz_file":          { "type": "string", "format": "uuid", "title": "KMZ File" },
        "drone_footage":     { "type": "string", "format": "uuid", "title": "Drone Footage of L'' Section" },
        "srp_notification":  { "type": "string", "format": "uuid", "title": "Notification of SRP" },
        "cala_nomination":   { "type": "string", "format": "uuid", "title": "CALA Nomination" }
      }
    }'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

-- Step 2: Add checklist property at root
UPDATE form_definitions
SET schema_json = jsonb_set(
    schema_json,
    '{properties,checklist}',
    '{"$ref": "#/$defs/Checklist"}'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

-- Step 3: Insert checklist between section_20h_i and mutation in section_codes
UPDATE form_definitions
SET section_codes = ARRAY['acquisition_details','srp','cala','section_20a','jmr','section_20d','section_20e','section_20f_g','section_20h_i','checklist','mutation']
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

-- Step 4: Update root ui:order
UPDATE form_definitions
SET ui_schema_json = jsonb_set(
    ui_schema_json,
    '{ui:order}',
    '["acquisition_details","srp","cala","section_20a","jmr","section_20d","section_20e","section_20f_g","section_20h_i","checklist","mutation"]'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

-- Step 5: Add checklist ui schema with scopeToField:true on all 4 attachment fields
UPDATE form_definitions
SET ui_schema_json = jsonb_set(
    ui_schema_json,
    '{checklist}',
    '{
      "ui:title": "Checklist",
      "ui:order": ["kmz_file","drone_footage","srp_notification","cala_nomination"],
      "kmz_file":         { "ui:widget": "attachment", "ui:options": { "scopeToField": true } },
      "drone_footage":    { "ui:widget": "attachment", "ui:options": { "scopeToField": true } },
      "srp_notification": { "ui:widget": "attachment", "ui:options": { "scopeToField": true } },
      "cala_nomination":  { "ui:widget": "attachment", "ui:options": { "scopeToField": true } }
    }'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';
