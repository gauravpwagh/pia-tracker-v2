-- V098: Section 20E — add "Name of Newspaper" before the existing Date field,
-- and add a "Local Newspaper PDF" attachment (previously missing here — Section 20E
-- only had a date, no upload).

UPDATE form_definitions
SET schema_json = jsonb_set(
    schema_json,
    '{$defs,Section20E,properties,local_newspaper_name}',
    '{"type": "string", "maxLength": 256, "title": "Name of Newspaper"}'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

UPDATE form_definitions
SET schema_json = jsonb_set(
    schema_json,
    '{$defs,Section20E,properties,local_newspaper_pdf}',
    '{"type": "string", "format": "uuid", "title": "Local Newspaper PDF"}'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

UPDATE form_definitions
SET ui_schema_json = jsonb_set(
    ui_schema_json,
    '{section_20e,ui:order}',
    '["declaration_gazette", "local_newspaper_name", "local_newspaper_pub_date", "local_newspaper_pdf"]'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

UPDATE form_definitions
SET ui_schema_json = jsonb_set(
    ui_schema_json,
    '{section_20e,local_newspaper_pdf}',
    '{"ui:widget": "attachment", "ui:options": {"scopeToField": true}}'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';
