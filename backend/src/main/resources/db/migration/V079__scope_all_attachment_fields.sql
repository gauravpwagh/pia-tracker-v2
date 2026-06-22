-- V079: Add scopeToField:true to all LA attachment fields so each field has
-- its own isolated upload pool instead of sharing ACTIVITY_RECORD.

-- srp: srp_gazette.pdf_attachment_id
UPDATE form_definitions
SET ui_schema_json = jsonb_set(ui_schema_json,
    '{srp,srp_gazette,pdf_attachment_id}',
    '{"ui:widget": "attachment", "ui:options": {"scopeToField": true}}'::jsonb)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

-- cala: cala_publication_in_gaz.pdf_attachment_id
UPDATE form_definitions
SET ui_schema_json = jsonb_set(ui_schema_json,
    '{cala,cala_publication_in_gaz,pdf_attachment_id}',
    '{"ui:widget": "attachment", "ui:options": {"scopeToField": true}}'::jsonb)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

-- section_20a: gazette_pub.pdf_attachment_id
UPDATE form_definitions
SET ui_schema_json = jsonb_set(ui_schema_json,
    '{section_20a,gazette_pub,pdf_attachment_id}',
    '{"ui:widget": "attachment", "ui:options": {"scopeToField": true}}'::jsonb)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

-- section_20a: local_newspaper_pdf
UPDATE form_definitions
SET ui_schema_json = jsonb_set(ui_schema_json,
    '{section_20a,local_newspaper_pdf}',
    '{"ui:widget": "attachment", "ui:options": {"scopeToField": true}}'::jsonb)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

-- section_20d: objections_pdf
UPDATE form_definitions
SET ui_schema_json = jsonb_set(ui_schema_json,
    '{section_20d,objections_pdf}',
    '{"ui:widget": "attachment", "ui:options": {"scopeToField": true}}'::jsonb)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

-- section_20e: declaration_gazette.pdf_attachment_id
UPDATE form_definitions
SET ui_schema_json = jsonb_set(ui_schema_json,
    '{section_20e,declaration_gazette,pdf_attachment_id}',
    '{"ui:widget": "attachment", "ui:options": {"scopeToField": true}}'::jsonb)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

-- section_20h_i: possession_pdf
UPDATE form_definitions
SET ui_schema_json = jsonb_set(ui_schema_json,
    '{section_20h_i,possession_pdf}',
    '{"ui:widget": "attachment", "ui:options": {"scopeToField": true}}'::jsonb)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

-- mutation: mutation_certificate
UPDATE form_definitions
SET ui_schema_json = jsonb_set(ui_schema_json,
    '{mutation,mutation_certificate}',
    '{"ui:widget": "attachment", "ui:options": {"scopeToField": true}}'::jsonb)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

-- FC stage_i: inspection_report_pdf
UPDATE form_definitions
SET ui_schema_json = jsonb_set(ui_schema_json,
    '{stage_i,inspection_report_pdf}',
    '{"ui:widget": "attachment", "ui:options": {"scopeToField": true}}'::jsonb)
WHERE id = 'ffffffff-0005-0001-0001-000000000001';

-- FC stage_ii: final_approval_pdf
UPDATE form_definitions
SET ui_schema_json = jsonb_set(ui_schema_json,
    '{stage_ii,final_approval_pdf}',
    '{"ui:widget": "attachment", "ui:options": {"scopeToField": true}}'::jsonb)
WHERE id = 'ffffffff-0005-0001-0001-000000000001';
