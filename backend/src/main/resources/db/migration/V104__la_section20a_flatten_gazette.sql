-- V104: Flatten Section 20A's nested "gazette_pub" (GazetteReference) into flat
-- sibling fields, so the frontend's row-grouping (FIELD_ROW_GROUPS) can put
-- "Notification Date" next to "Published On", and "Gazette Number" next to
-- "Gazette PDF" — grouping only works across siblings in the SAME object, and
-- a nested $ref object renders as its own separate sub-block.

UPDATE form_definitions
SET schema_json = jsonb_set(
    schema_json,
    '{$defs,Section20A,properties}',
    ((schema_json -> '$defs' -> 'Section20A' -> 'properties') - 'gazette_pub')
        || '{
          "gazette_published_on": { "type": "string", "format": "date", "title": "Published On"   },
          "gazette_number":       { "type": "string", "maxLength": 64,  "title": "Gazette Number"  },
          "gazette_pdf":          { "type": "string", "format": "uuid", "title": "Gazette PDF"     }
        }'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

UPDATE form_definitions
SET ui_schema_json = jsonb_set(
    ui_schema_json,
    '{section_20a}',
    '{
      "ui:title": "Section 20A — Notification",
      "ui:order": ["notification_date", "gazette_published_on", "gazette_number", "gazette_pdf", "local_newspaper_name", "local_newspaper_pub_date", "local_newspaper_pdf"],
      "gazette_pdf":          { "ui:widget": "attachment", "ui:options": {"scopeToField": true} },
      "local_newspaper_pdf":  { "ui:widget": "attachment", "ui:options": {"scopeToField": true} }
    }'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

-- Migrate existing record data: gazette_pub.{published_on,gaz_number,pdf_attachment_id}
-- -> flat gazette_published_on / gazette_number / gazette_pdf.
UPDATE activity_records
SET data_json = jsonb_set(
    data_json,
    '{section_20a}',
    ((data_json -> 'section_20a') - 'gazette_pub') || jsonb_strip_nulls(jsonb_build_object(
        'gazette_published_on', data_json -> 'section_20a' -> 'gazette_pub' -> 'published_on',
        'gazette_number',       data_json -> 'section_20a' -> 'gazette_pub' -> 'gaz_number',
        'gazette_pdf',          data_json -> 'section_20a' -> 'gazette_pub' -> 'pdf_attachment_id'
    ))
)
WHERE form_definition_id = 'ffffffff-0001-0001-0001-000000000001'
  AND data_json -> 'section_20a' ? 'gazette_pub';

-- Re-point any already-uploaded gazette PDF attachments from the old nested
-- field key to the new flat one (attachment identity is entity_type + entity_id;
-- entity_id/the file itself are untouched, only the scoped field-key string changes).
UPDATE attachments
SET entity_type = 'ACTIVITY_RECORD__section_20a_gazette_pdf'
WHERE entity_type = 'ACTIVITY_RECORD__section_20a_gazette_pub_pdf_attachment_id';

