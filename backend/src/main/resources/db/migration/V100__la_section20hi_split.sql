-- V100: Split "Section 20H-I" into two visually separate sub-blocks within the
-- same section tab: "Section 20H" (new: Deposit Amount, Date of Payment, PDF) and
-- "Section 20I — Payment & Possession" (existing fields, unchanged).
--
-- Implemented as two nested sub-objects (section_20h / section_20i) under the
-- existing section_20h_i property, following the same nested-object pattern
-- already used for acquisition_details (V070) — each nested object renders as
-- its own titled sub-panel.

-- ── Step 1: New $defs for the two sub-blocks ─────────────────────────────────

UPDATE form_definitions
SET schema_json = jsonb_set(
    schema_json,
    '{$defs,Section20H}',
    '{
      "type": "object",
      "title": "Section 20H",
      "properties": {
        "deposit_amount":    { "type": "number", "minimum": 0, "title": "Deposit Amount (₹)" },
        "date_of_payment":   { "type": "string", "format": "date", "title": "Date of Payment" },
        "deposit_pdf":       { "type": "string", "format": "uuid", "title": "Deposit Payment PDF" }
      },
      "additionalProperties": false
    }'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

UPDATE form_definitions
SET schema_json = jsonb_set(
    schema_json,
    '{$defs,Section20I}',
    '{
      "type": "object",
      "title": "Section 20I — Payment & Possession",
      "properties": {
        "payment_made_to":     { "type": "string", "maxLength": 256, "title": "Payment Made To"     },
        "payment_date":        { "type": "string", "format": "date", "title": "Payment Date"        },
        "possession_given_on": { "type": "string", "format": "date", "title": "Possession Given On" },
        "possession_pdf":      { "type": "string", "format": "uuid", "title": "Possession Order PDF"}
      },
      "additionalProperties": false
    }'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

-- ── Step 2: Section20HI now nests the two sub-blocks instead of flat fields ──

UPDATE form_definitions
SET schema_json = jsonb_set(
    schema_json,
    '{$defs,Section20HI}',
    '{
      "type": "object",
      "title": "Section 20H-I — Payment & Possession",
      "properties": {
        "section_20h": { "$ref": "#/$defs/Section20H" },
        "section_20i": { "$ref": "#/$defs/Section20I" }
      },
      "additionalProperties": false
    }'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

-- ── Step 3: ui_schema — two titled sub-panels within the same tab ────────────

UPDATE form_definitions
SET ui_schema_json = jsonb_set(
    ui_schema_json,
    '{section_20h_i}',
    '{
      "ui:title": "Section 20H-I — Payment & Possession",
      "ui:order": ["section_20h", "section_20i"],
      "section_20h": {
        "ui:title": "Section 20H",
        "ui:order": ["deposit_amount", "date_of_payment", "deposit_pdf"],
        "deposit_pdf": { "ui:widget": "attachment", "ui:options": {"scopeToField": true} }
      },
      "section_20i": {
        "ui:title": "Section 20I — Payment & Possession",
        "ui:order": ["payment_made_to", "payment_date", "possession_given_on", "possession_pdf"],
        "possession_pdf": { "ui:widget": "attachment", "ui:options": {"scopeToField": true} }
      }
    }'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

-- ── Step 4: Migrate existing record data — nest the old flat fields under
-- section_20i so already-entered Payment & Possession data isn't orphaned.

UPDATE activity_records
SET data_json = (data_json - 'section_20h_i') || jsonb_build_object(
    'section_20h_i', jsonb_build_object(
        'section_20i', jsonb_strip_nulls(jsonb_build_object(
            'payment_made_to',     data_json -> 'section_20h_i' -> 'payment_made_to',
            'payment_date',        data_json -> 'section_20h_i' -> 'payment_date',
            'possession_given_on', data_json -> 'section_20h_i' -> 'possession_given_on',
            'possession_pdf',      data_json -> 'section_20h_i' -> 'possession_pdf'
        ))
    )
)
WHERE form_definition_id = 'ffffffff-0001-0001-0001-000000000001'
  AND data_json ? 'section_20h_i';
