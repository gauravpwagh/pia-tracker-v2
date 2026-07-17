-- V099: Rename "Section 20F-G" to "Section 20F" and add an "Award Declaration"
-- PDF upload alongside the existing compensation fields (nothing removed).

UPDATE form_definitions
SET schema_json = jsonb_set(schema_json, '{$defs,Section20FG,title}', '"Section 20F"'::jsonb)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

UPDATE form_definitions
SET schema_json = jsonb_set(
    schema_json,
    '{$defs,Section20FG,properties,award_declaration_pdf}',
    '{"type": "string", "format": "uuid", "title": "Award Declaration"}'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

UPDATE form_definitions
SET ui_schema_json = jsonb_set(ui_schema_json, '{section_20f_g,ui:title}', '"Section 20F"'::jsonb)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

UPDATE form_definitions
SET ui_schema_json = jsonb_set(
    ui_schema_json,
    '{section_20f_g,ui:order}',
    '["competent_authority", "compensation_determined_on", "compensation_amount", "market_value_basis", "award_declaration_pdf"]'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

UPDATE form_definitions
SET ui_schema_json = jsonb_set(
    ui_schema_json,
    '{section_20f_g,award_declaration_pdf}',
    '{"ui:widget": "attachment", "ui:options": {"scopeToField": true}}'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';
