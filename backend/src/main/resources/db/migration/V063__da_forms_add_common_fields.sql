-- V063: Add common fields to all DRAWING_APPROVAL form definitions.
--
-- New fields added to every form:
--   record_name, section, station, initiation_date, other_details,
--   remarks (if not already present), sanction_received_date
--
-- ESP also gets: concept_esp_difference
-- GRADE_CONDONATION also gets: curve_details
--
-- Removes additionalProperties: false so existing dataJson fields survive.

-- ── Step 1: Add common fields to ALL drawing forms ─────────────────────────

UPDATE form_definitions
SET
  schema_json = jsonb_set(
    schema_json #- '{additionalProperties}',
    '{properties}',
    (schema_json -> 'properties') || '{
      "record_name":           {"type":"string","title":"Record Name","minLength":1,"maxLength":256},
      "section":               {"type":"string","title":"Section","maxLength":256},
      "station":               {"type":"string","title":"Station","maxLength":256},
      "initiation_date":       {"type":"string","title":"Initiation Date","format":"date"},
      "other_details":         {"type":"string","title":"Other Details"},
      "remarks":               {"type":"string","title":"Remarks"},
      "sanction_received_date":{"type":"string","title":"Sanction Received Date","format":"date"}
    }'::jsonb
  ),
  ui_schema_json = jsonb_set(
    ui_schema_json,
    '{ui:order}',
    (
      SELECT jsonb_build_array(
        'record_name','section','station','initiation_date'
      ) || jsonb_agg(elem ORDER BY idx)
      FROM jsonb_array_elements(
        COALESCE(ui_schema_json -> 'ui:order', '[]'::jsonb)
      ) WITH ORDINALITY AS t(elem, idx)
      WHERE elem NOT IN (
        '"record_name"'::jsonb,'"section"'::jsonb,'"station"'::jsonb,'"initiation_date"'::jsonb,
        '"other_details"'::jsonb,'"remarks"'::jsonb,'"sanction_received_date"'::jsonb
      )
    ) || '["other_details","remarks","sanction_received_date"]'::jsonb
  ) || '{
    "other_details":          {"ui:widget":"textarea"},
    "remarks":                {"ui:widget":"textarea"},
    "sanction_received_date": {"ui:widget":"date"},
    "initiation_date":        {"ui:widget":"date"}
  }'::jsonb
WHERE activity_type_code = 'DRAWING_APPROVAL';

-- ── Step 2: ESP-specific conditional field ─────────────────────────────────

UPDATE form_definitions
SET schema_json = jsonb_set(
  schema_json,
  '{properties}',
  (schema_json -> 'properties') || '{
    "concept_esp_difference": {"type":"string","title":"Difference between Concept Plan and ESP"}
  }'::jsonb
),
ui_schema_json = jsonb_set(
  ui_schema_json,
  '{ui:order}',
  (
    -- Insert concept_esp_difference after station (position 3, 0-indexed)
    SELECT jsonb_agg(elem ORDER BY idx)
    FROM (
      SELECT elem, idx FROM jsonb_array_elements(ui_schema_json -> 'ui:order') WITH ORDINALITY AS t(elem, idx)
      UNION ALL
      SELECT to_jsonb('concept_esp_difference'::text),
        (SELECT (max(idx) + 0.5) FROM (
          SELECT ordinality AS idx FROM jsonb_array_elements(ui_schema_json -> 'ui:order') WITH ORDINALITY
          WHERE value = '"station"'::jsonb
        ) s)
    ) sub
    WHERE elem IS NOT NULL
  )
) || '{"concept_esp_difference":{"ui:widget":"textarea"}}'::jsonb
WHERE code = 'ESP_DRAWING_V1';

-- ── Step 3: Grade Condonation-specific conditional field ───────────────────

UPDATE form_definitions
SET schema_json = jsonb_set(
  schema_json,
  '{properties}',
  (schema_json -> 'properties') || '{
    "curve_details": {"type":"string","title":"Curve Details"}
  }'::jsonb
),
ui_schema_json = jsonb_set(
  ui_schema_json,
  '{ui:order}',
  (
    SELECT jsonb_agg(elem ORDER BY idx)
    FROM (
      SELECT elem, idx FROM jsonb_array_elements(ui_schema_json -> 'ui:order') WITH ORDINALITY AS t(elem, idx)
      UNION ALL
      SELECT to_jsonb('curve_details'::text),
        (SELECT (max(idx) + 0.5) FROM (
          SELECT ordinality AS idx FROM jsonb_array_elements(ui_schema_json -> 'ui:order') WITH ORDINALITY
          WHERE value = '"station"'::jsonb
        ) s)
    ) sub
    WHERE elem IS NOT NULL
  )
) || '{"curve_details":{"ui:widget":"textarea"}}'::jsonb
WHERE code = 'GRADE_CONDONATION_DRAWING_V1';
