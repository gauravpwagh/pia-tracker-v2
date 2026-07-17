-- V097: JMR section changes.
--   - "Fee Submitted On" -> "Fee Submitted by Railways" (title only, key unchanged).
--   - "Reason for Revision" rendered as a multi-line text box.
--   - New "Re-JMR" toggle (re_jmr), mirroring "Revision Required?".
--
-- The 4 fee/date fields (Fee Demanded On, Fee Amount, Fee Submitted by Railways,
-- JMR Done On) stay declared in the schema (so existing data + additionalProperties:false
-- both keep working) but are only *shown* when re_jmr is true — filtered client-side in
-- RecordEditPage.tsx's filterJmrSchema, the same technique already used for Utility
-- Shifting's agency-conditional fields (filterUsSchema).

UPDATE form_definitions
SET schema_json = jsonb_set(
    schema_json,
    '{$defs,JmrSection,properties,jmr_fee_submitted_on,title}',
    '"Fee Submitted by Railways"'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

UPDATE form_definitions
SET schema_json = jsonb_set(
    schema_json,
    '{$defs,JmrSection,properties,re_jmr}',
    '{"type": "boolean", "title": "Re-JMR"}'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

UPDATE form_definitions
SET ui_schema_json = jsonb_set(
    ui_schema_json,
    '{jmr,ui:order}',
    '["revision_required", "revision_reason", "re_jmr", "jmr_fee_demanded_on", "jmr_fee_amount", "jmr_fee_submitted_on", "jmr_done_on"]'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

UPDATE form_definitions
SET ui_schema_json = jsonb_set(
    ui_schema_json,
    '{jmr,revision_reason}',
    '{"ui:widget": "textarea"}'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';
