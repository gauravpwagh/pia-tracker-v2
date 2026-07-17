-- V105: Flatten Section 20E's nested "declaration_gazette" (GazetteReference)
-- into flat sibling fields, same reason as V104 for Section 20A — row-grouping
-- needs siblings in the same object, not a nested $ref sub-block.

UPDATE form_definitions
SET schema_json = jsonb_set(
    schema_json,
    '{$defs,Section20E,properties}',
    ((schema_json -> '$defs' -> 'Section20E' -> 'properties') - 'declaration_gazette')
        || '{
          "declaration_gazette_published_on": { "type": "string", "format": "date", "title": "Published On"  },
          "declaration_gazette_number":       { "type": "string", "maxLength": 64,  "title": "Gazette Number" },
          "declaration_gazette_pdf":          { "type": "string", "format": "uuid", "title": "Gazette PDF"    }
        }'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

UPDATE form_definitions
SET ui_schema_json = jsonb_set(
    ui_schema_json,
    '{section_20e}',
    '{
      "ui:title": "Section 20E — Declaration",
      "ui:order": ["declaration_gazette_published_on", "declaration_gazette_number", "declaration_gazette_pdf", "local_newspaper_name", "local_newspaper_pub_date", "local_newspaper_pdf"],
      "declaration_gazette_pdf": { "ui:widget": "attachment", "ui:options": {"scopeToField": true} },
      "local_newspaper_pdf":     { "ui:widget": "attachment", "ui:options": {"scopeToField": true} }
    }'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

UPDATE activity_records
SET data_json = jsonb_set(
    data_json,
    '{section_20e}',
    ((data_json -> 'section_20e') - 'declaration_gazette') || jsonb_strip_nulls(jsonb_build_object(
        'declaration_gazette_published_on', data_json -> 'section_20e' -> 'declaration_gazette' -> 'published_on',
        'declaration_gazette_number',       data_json -> 'section_20e' -> 'declaration_gazette' -> 'gaz_number',
        'declaration_gazette_pdf',          data_json -> 'section_20e' -> 'declaration_gazette' -> 'pdf_attachment_id'
    ))
)
WHERE form_definition_id = 'ffffffff-0001-0001-0001-000000000001'
  AND data_json -> 'section_20e' ? 'declaration_gazette';

UPDATE attachments
SET entity_type = 'ACTIVITY_RECORD__section_20e_declaration_gazette_pdf'
WHERE entity_type = 'ACTIVITY_RECORD__section_20e_declaration_gazette_pdf_attachment_id';
