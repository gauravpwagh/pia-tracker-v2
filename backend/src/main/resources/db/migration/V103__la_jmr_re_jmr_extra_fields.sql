-- V103: Correction to V097 — the original 4 JMR fields (Fee Demanded On, Fee
-- Amount, Fee Submitted by Railways, JMR Done On) stay visible by default (they
-- were never meant to be hidden). Re-JMR instead adds a SECOND set of the same
-- 4 fields for the repeat round, shown only when the Re-JMR toggle is on.

UPDATE form_definitions
SET schema_json = jsonb_set(
    schema_json,
    '{$defs,JmrSection,properties,re_jmr_fee_demanded_on}',
    '{"type": "string", "format": "date", "title": "Re-JMR Fee Demanded On"}'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

UPDATE form_definitions
SET schema_json = jsonb_set(
    schema_json,
    '{$defs,JmrSection,properties,re_jmr_fee_amount}',
    '{"type": "number", "minimum": 0, "title": "Re-JMR Fee Amount (₹)"}'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

UPDATE form_definitions
SET schema_json = jsonb_set(
    schema_json,
    '{$defs,JmrSection,properties,re_jmr_fee_submitted_on}',
    '{"type": "string", "format": "date", "title": "Re-JMR Fee Submitted by Railways"}'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

UPDATE form_definitions
SET schema_json = jsonb_set(
    schema_json,
    '{$defs,JmrSection,properties,re_jmr_done_on}',
    '{"type": "string", "format": "date", "title": "Re-JMR Done On"}'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

UPDATE form_definitions
SET ui_schema_json = jsonb_set(
    ui_schema_json,
    '{jmr,ui:order}',
    '[
      "revision_required", "revision_reason", "re_jmr",
      "jmr_fee_demanded_on", "jmr_fee_amount", "jmr_fee_submitted_on", "jmr_done_on",
      "re_jmr_fee_demanded_on", "re_jmr_fee_amount", "re_jmr_fee_submitted_on", "re_jmr_done_on"
    ]'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';
