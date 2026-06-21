-- V070: Add 'Acquisition Details' as the first section of LAND_ACQUISITION_V1.
--
-- New $defs.AcquisitionDetails contains:
--   record_name, block_section (new fields)
--   district, sub_division_taluka, area_hectares_* (moved from root)
--   est_villages (new field)
--
-- Root-level flat fields (district, sub_division_taluka, area_hectares_*) are
-- removed from the root schema and ui:order; they now live inside
-- acquisition_details.
--
-- Existing records: data is migrated to nest the moved fields under
-- acquisition_details in data_json.

-- ── Step 1: Add AcquisitionDetails $def ──────────────────────────────────────

UPDATE form_definitions
SET schema_json = jsonb_set(
    schema_json,
    '{$defs,AcquisitionDetails}',
    '{
      "type": "object",
      "title": "Acquisition Details",
      "properties": {
        "record_name":           { "type": "string", "title": "Record Name",           "minLength": 1, "maxLength": 256 },
        "block_section":         { "type": "string", "title": "Block Section",         "maxLength": 128 },
        "district":              { "type": "string", "title": "District",              "maxLength": 128 },
        "sub_division_taluka":   { "type": "string", "title": "Sub-Division / Taluka", "maxLength": 128 },
        "area_hectares_total":   { "type": "number", "title": "Total Area (ha)",       "minimum": 0 },
        "area_hectares_private": { "type": "number", "title": "Private Land (ha)",     "minimum": 0 },
        "area_hectares_govt":    { "type": "number", "title": "Govt. Land (ha)",       "minimum": 0 },
        "area_hectares_forest":  { "type": "number", "title": "Forest Land (ha)",      "minimum": 0 },
        "est_villages":          { "type": "number", "title": "Est. No. of Villages",  "minimum": 0 }
      },
      "additionalProperties": false
    }'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

-- ── Step 2: Add acquisition_details property to root ─────────────────────────

UPDATE form_definitions
SET schema_json = jsonb_set(
    schema_json,
    '{properties,acquisition_details}',
    '{"$ref": "#/$defs/AcquisitionDetails"}'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

-- ── Step 3: Remove moved fields from root properties ─────────────────────────

UPDATE form_definitions
SET schema_json = jsonb_set(
    schema_json,
    '{properties}',
    (schema_json -> 'properties')
        - 'district'
        - 'sub_division_taluka'
        - 'area_hectares_total'
        - 'area_hectares_private'
        - 'area_hectares_govt'
        - 'area_hectares_forest'
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

-- ── Step 4: Prepend acquisition_details to section_codes ─────────────────────

UPDATE form_definitions
SET section_codes = ARRAY['acquisition_details'] || section_codes
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

-- ── Step 5: Update ui_schema_json ────────────────────────────────────────────

-- 5a: Remove moved fields from root ui:order
UPDATE form_definitions
SET ui_schema_json = jsonb_set(
    ui_schema_json,
    '{ui:order}',
    (
        SELECT jsonb_agg(elem)
        FROM jsonb_array_elements_text(ui_schema_json -> 'ui:order') AS elem
        WHERE elem NOT IN ('district','sub_division_taluka',
                           'area_hectares_total','area_hectares_private',
                           'area_hectares_govt','area_hectares_forest',
                           'acquisition_details')
    )
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

-- 5b: Prepend acquisition_details to root ui:order
UPDATE form_definitions
SET ui_schema_json = jsonb_set(
    ui_schema_json,
    '{ui:order}',
    '["acquisition_details"]'::jsonb || (ui_schema_json -> 'ui:order')
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

-- 5c: Add acquisition_details section ui config
UPDATE form_definitions
SET ui_schema_json = jsonb_set(
    ui_schema_json,
    '{acquisition_details}',
    '{
      "ui:title": "Acquisition Details",
      "ui:order": [
        "record_name","block_section","district","sub_division_taluka",
        "area_hectares_total","area_hectares_private","area_hectares_govt",
        "area_hectares_forest","est_villages"
      ]
    }'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

-- ── Step 6: Migrate existing record data ─────────────────────────────────────
-- Move root-level flat fields into the acquisition_details sub-object, then
-- remove them from root. Only touches records that belong to this form.

UPDATE activity_records
SET data_json = (
    -- Build new acquisition_details object by merging old root fields
    -- (preserving any that were already set)
    jsonb_set(
        -- First remove the moved fields from root
        data_json
            - 'district'
            - 'sub_division_taluka'
            - 'area_hectares_total'
            - 'area_hectares_private'
            - 'area_hectares_govt'
            - 'area_hectares_forest',
        '{acquisition_details}',
        -- Merge existing acquisition_details (if any) with the moved fields
        COALESCE(data_json -> 'acquisition_details', '{}'::jsonb)
        || jsonb_strip_nulls(jsonb_build_object(
            'district',              data_json -> 'district',
            'sub_division_taluka',   data_json -> 'sub_division_taluka',
            'area_hectares_total',   data_json -> 'area_hectares_total',
            'area_hectares_private', data_json -> 'area_hectares_private',
            'area_hectares_govt',    data_json -> 'area_hectares_govt',
            'area_hectares_forest',  data_json -> 'area_hectares_forest'
        ))
    )
)
WHERE form_definition_id = 'ffffffff-0001-0001-0001-000000000001';
