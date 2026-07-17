-- V096: Section 20A — add "Name of Newspaper" before the existing Date and PDF fields.

UPDATE form_definitions
SET schema_json = jsonb_set(
    schema_json,
    '{$defs,Section20A,properties,local_newspaper_name}',
    '{"type": "string", "maxLength": 256, "title": "Name of Newspaper"}'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

UPDATE form_definitions
SET ui_schema_json = jsonb_set(
    ui_schema_json,
    '{section_20a,ui:order}',
    '["notification_date", "gazette_pub", "local_newspaper_name", "local_newspaper_pub_date", "local_newspaper_pdf"]'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';
