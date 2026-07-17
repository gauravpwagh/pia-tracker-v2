-- V102: Correction to V100 — "Section 20H" and "Section 20I" become fully
-- separate sections (their own left-nav tab + independent workflow instance),
-- not just two titled sub-panels inside one "section_20h_i" tab.
--
-- "Section 20H-I — Payment & Possession" is renamed "Section 20H Deposit" for
-- the 20H side; 20I keeps "Section 20I — Payment & Possession".

-- ── Step 1: schema_json — two independent $defs, promoted to root properties ──

UPDATE form_definitions
SET schema_json = jsonb_set(schema_json, '{$defs,Section20H,title}', '"Section 20H Deposit"'::jsonb)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

UPDATE form_definitions
SET schema_json = jsonb_set(
    schema_json,
    '{properties}',
    (schema_json -> 'properties')
        - 'section_20h_i'
        || jsonb_build_object(
            'section_20h', jsonb_build_object('$ref', '#/$defs/Section20H'),
            'section_20i', jsonb_build_object('$ref', '#/$defs/Section20I')
        )
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

UPDATE form_definitions
SET schema_json = schema_json #- '{$defs,Section20HI}'
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

-- ── Step 2: section_codes — replace the single 'section_20h_i' with two codes,
-- in-place (so 'section_20i' lands right after 'section_20h', not appended at
-- the end).

UPDATE form_definitions
SET section_codes = (
    SELECT array_agg(x ORDER BY ord, sub_ord)
    FROM unnest(section_codes) WITH ORDINALITY AS t(code, ord)
    CROSS JOIN LATERAL unnest(
        CASE WHEN code = 'section_20h_i' THEN ARRAY['section_20h', 'section_20i'] ELSE ARRAY[code] END
    ) WITH ORDINALITY AS u(x, sub_ord)
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

-- ── Step 3: ui_schema_json — drop the combined tab config, add two standalone ones ──

UPDATE form_definitions
SET ui_schema_json = ui_schema_json #- '{section_20h_i}'
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

UPDATE form_definitions
SET ui_schema_json = jsonb_set(
    ui_schema_json,
    '{section_20h}',
    '{
      "ui:title": "Section 20H Deposit",
      "ui:order": ["deposit_amount", "date_of_payment", "deposit_pdf"],
      "deposit_pdf": { "ui:widget": "attachment", "ui:options": {"scopeToField": true} }
    }'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

UPDATE form_definitions
SET ui_schema_json = jsonb_set(
    ui_schema_json,
    '{section_20i}',
    '{
      "ui:title": "Section 20I — Payment & Possession",
      "ui:order": ["payment_made_to", "payment_date", "possession_given_on", "possession_pdf"],
      "possession_pdf": { "ui:widget": "attachment", "ui:options": {"scopeToField": true} }
    }'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

-- Root ui:order: replace 'section_20h_i' with 'section_20h', 'section_20i', in-place.
UPDATE form_definitions
SET ui_schema_json = jsonb_set(
    ui_schema_json,
    '{ui:order}',
    (
        SELECT jsonb_agg(x ORDER BY ord, sub_ord)
        FROM jsonb_array_elements_text(ui_schema_json -> 'ui:order') WITH ORDINALITY AS t(code, ord)
        CROSS JOIN LATERAL unnest(
            CASE WHEN code = 'section_20h_i' THEN ARRAY['section_20h', 'section_20i'] ELSE ARRAY[code] END
        ) WITH ORDINALITY AS u(x, sub_ord)
    )
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

-- ── Step 4: migrate existing record data ─────────────────────────────────────
-- V100 nested old flat fields under data_json.section_20h_i.section_20i.*;
-- promote that straight to top-level data_json.section_20i (section_20h has no
-- prior data — it's an entirely new section).

UPDATE activity_records
SET data_json = (data_json - 'section_20h_i')
    || jsonb_build_object('section_20i', COALESCE(data_json -> 'section_20h_i' -> 'section_20i', '{}'::jsonb))
WHERE form_definition_id = 'ffffffff-0001-0001-0001-000000000001'
  AND data_json ? 'section_20h_i';

-- ── Step 5: workflow instances — the existing 'section_20h_i' instance's
-- progress/state carries over to 'section_20i' (that's where the data lived);
-- a fresh 'section_20h' instance is created in the initial state for every
-- Land Acquisition record that has a section_20h_i (now section_20i) instance.

INSERT INTO workflow_instances (workflow_definition_id, entity_type, entity_id, section_code, current_state_id)
SELECT wi.workflow_definition_id, wi.entity_type, wi.entity_id, 'section_20h',
       (SELECT id FROM workflow_states WHERE workflow_definition_id = wi.workflow_definition_id AND is_initial = true LIMIT 1)
FROM workflow_instances wi
WHERE wi.entity_type = 'ACTIVITY_RECORD'
  AND wi.section_code = 'section_20h_i'
  AND wi.entity_id IN (SELECT id FROM activity_records WHERE form_definition_id = 'ffffffff-0001-0001-0001-000000000001');

UPDATE workflow_instances
SET section_code = 'section_20i'
WHERE entity_type = 'ACTIVITY_RECORD'
  AND section_code = 'section_20h_i'
  AND entity_id IN (SELECT id FROM activity_records WHERE form_definition_id = 'ffffffff-0001-0001-0001-000000000001');
