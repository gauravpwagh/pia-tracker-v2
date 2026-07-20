-- V108: Section 20D — add "CALA Decision PDF" attachment (the CALA — Certificate
-- of Availability of Land — decision document), alongside the existing Objections PDF.

UPDATE form_definitions
SET schema_json = jsonb_set(
    schema_json,
    '{$defs,Section20D,properties,cala_decision_pdf}',
    '{"type": "string", "format": "uuid", "title": "CALA Decision PDF"}'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

UPDATE form_definitions
SET ui_schema_json = jsonb_set(
    ui_schema_json,
    '{section_20d,ui:order}',
    '["objections_received", "objections_summary", "hearing_date", "objections_pdf", "cala_decision_pdf"]'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

UPDATE form_definitions
SET ui_schema_json = jsonb_set(
    ui_schema_json,
    '{section_20d,cala_decision_pdf}',
    '{"ui:widget": "attachment", "ui:options": {"scopeToField": true}}'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';
