-- V086: Split the single "block_section" field into "block_section_from" and
-- "block_section_to" across all 5 forms that carry it (TOS, TP, US, LA, FC).
--
-- No existing activity_records data carries block_section (confirmed: no seed/demo
-- data uses it), so this migration only updates form_definitions — no data_json
-- backfill is needed.

-- ── Temporary Office Space (root-level field) ────────────────────────────────

UPDATE form_definitions
SET
  schema_json = jsonb_set(
    schema_json,
    '{properties}',
    (schema_json -> 'properties') - 'block_section' || '{
      "block_section_from": { "type": "string", "title": "From Station", "maxLength": 256 },
      "block_section_to":   { "type": "string", "title": "To Station",   "maxLength": 256 }
    }'::jsonb
  ),
  ui_schema_json = jsonb_set(
    ui_schema_json,
    '{ui:order}',
    (
      SELECT jsonb_agg(elem)
      FROM (
        SELECT CASE WHEN elem = '"block_section"'
                 THEN '["block_section_from","block_section_to"]'::jsonb
                 ELSE jsonb_build_array(elem)
               END AS expanded
        FROM jsonb_array_elements(ui_schema_json -> 'ui:order') AS elem
      ) t, jsonb_array_elements(t.expanded) AS elem
    )
  )
WHERE code = 'TEMPORARY_OFFICE_SPACE_V1';

-- ── Tender Packaging (root-level field) ───────────────────────────────────────

UPDATE form_definitions
SET
  schema_json = jsonb_set(
    schema_json,
    '{properties}',
    (schema_json -> 'properties') - 'block_section' || '{
      "block_section_from": { "type": "string", "title": "From Station", "maxLength": 256 },
      "block_section_to":   { "type": "string", "title": "To Station",   "maxLength": 256 }
    }'::jsonb
  ),
  ui_schema_json = jsonb_set(
    ui_schema_json,
    '{ui:order}',
    (
      SELECT jsonb_agg(elem)
      FROM (
        SELECT CASE WHEN elem = '"block_section"'
                 THEN '["block_section_from","block_section_to"]'::jsonb
                 ELSE jsonb_build_array(elem)
               END AS expanded
        FROM jsonb_array_elements(ui_schema_json -> 'ui:order') AS elem
      ) t, jsonb_array_elements(t.expanded) AS elem
    )
  )
WHERE code = 'TENDER_PACKAGING_V1';

-- ── Utility Shifting (root-level field) ───────────────────────────────────────

UPDATE form_definitions
SET
  schema_json = jsonb_set(
    schema_json,
    '{properties}',
    (schema_json -> 'properties') - 'block_section' || '{
      "block_section_from": { "type": "string", "title": "From Station", "maxLength": 256 },
      "block_section_to":   { "type": "string", "title": "To Station",   "maxLength": 256 }
    }'::jsonb
  ),
  ui_schema_json = jsonb_set(
    ui_schema_json,
    '{ui:order}',
    (
      SELECT jsonb_agg(elem)
      FROM (
        SELECT CASE WHEN elem = '"block_section"'
                 THEN '["block_section_from","block_section_to"]'::jsonb
                 ELSE jsonb_build_array(elem)
               END AS expanded
        FROM jsonb_array_elements(ui_schema_json -> 'ui:order') AS elem
      ) t, jsonb_array_elements(t.expanded) AS elem
    )
  )
WHERE code = 'UTILITY_SHIFTING_V1';

-- ── Land Acquisition ($defs.AcquisitionDetails, nested under acquisition_details) ─

UPDATE form_definitions
SET schema_json = jsonb_set(
    schema_json,
    '{$defs,AcquisitionDetails,properties}',
    (schema_json -> '$defs' -> 'AcquisitionDetails' -> 'properties') - 'block_section' || '{
      "block_section_from": { "type": "string", "title": "From Station", "maxLength": 128 },
      "block_section_to":   { "type": "string", "title": "To Station",   "maxLength": 128 }
    }'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

UPDATE form_definitions
SET ui_schema_json = jsonb_set(
    ui_schema_json,
    '{acquisition_details,ui:order}',
    (
      SELECT jsonb_agg(elem)
      FROM (
        SELECT CASE WHEN elem = '"block_section"'
                 THEN '["block_section_from","block_section_to"]'::jsonb
                 ELSE jsonb_build_array(elem)
               END AS expanded
        FROM jsonb_array_elements(ui_schema_json -> 'acquisition_details' -> 'ui:order') AS elem
      ) t, jsonb_array_elements(t.expanded) AS elem
    )
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

-- ── Forest Clearance ($defs.AcquisitionDetails, nested under acquisition_details) ─

UPDATE form_definitions
SET schema_json = jsonb_set(
    schema_json,
    '{$defs,AcquisitionDetails,properties}',
    (schema_json -> '$defs' -> 'AcquisitionDetails' -> 'properties') - 'block_section' || '{
      "block_section_from": { "type": "string", "title": "From Station", "maxLength": 256 },
      "block_section_to":   { "type": "string", "title": "To Station",   "maxLength": 256 }
    }'::jsonb
)
WHERE id = 'ffffffff-0005-0001-0001-000000000001';

UPDATE form_definitions
SET ui_schema_json = jsonb_set(
    ui_schema_json,
    '{acquisition_details,ui:order}',
    (
      SELECT jsonb_agg(elem)
      FROM (
        SELECT CASE WHEN elem = '"block_section"'
                 THEN '["block_section_from","block_section_to"]'::jsonb
                 ELSE jsonb_build_array(elem)
               END AS expanded
        FROM jsonb_array_elements(ui_schema_json -> 'acquisition_details' -> 'ui:order') AS elem
      ) t, jsonb_array_elements(t.expanded) AS elem
    )
)
WHERE id = 'ffffffff-0005-0001-0001-000000000001';
