-- V064: Restructure all DRAWING_APPROVAL forms into two RJSF sections:
--   drawing_details — Record Name, Section, Station, Initiation Date,
--                     Drawing Number, Chainage, Description, Revision,
--                     Other Details (+ ESP: concept_esp_difference,
--                                   + GC:  curve_details)
--   sanction        — Remarks, Sanction Received Date
--
-- approval_chain stays at schema root (legacy field, managed separately).
-- section_codes set to ['drawing_details','sanction'] for all 23 forms.
--
-- Existing record data_json is migrated from flat → nested.

-- ── Step 1: Restructure schema_json + ui_schema_json for ALL DA forms ─────────

UPDATE form_definitions
SET
  -- Rebuild schema: move flat fields into $defs sub-objects, add $refs
  schema_json = (
    -- Preserve existing $defs (Chainage etc.) and add our two new section defs
    SELECT jsonb_build_object(
      '$schema', schema_json->'$schema',
      '$id',     schema_json->'$id',
      'type',    'object',
      'title',   schema_json->'title',
      '$defs',
        COALESCE(schema_json->'$defs', '{}'::jsonb) || jsonb_build_object(
          'DrawingDetails', jsonb_build_object(
            'type', 'object',
            'title', 'Drawing Details',
            'properties', jsonb_strip_nulls(jsonb_build_object(
              'record_name',    schema_json->'properties'->'record_name',
              'section',        schema_json->'properties'->'section',
              'station',        schema_json->'properties'->'station',
              'initiation_date',schema_json->'properties'->'initiation_date',
              'drawing_number', schema_json->'properties'->'drawing_number',
              'chainage_from',  schema_json->'properties'->'chainage_from',
              'chainage_to',    schema_json->'properties'->'chainage_to',
              'description',    schema_json->'properties'->'description',
              'revision',       schema_json->'properties'->'revision',
              'other_details',  schema_json->'properties'->'other_details'
            ))
          ),
          'Sanction', jsonb_build_object(
            'type', 'object',
            'title', 'Sanction',
            'properties', jsonb_strip_nulls(jsonb_build_object(
              'remarks',               schema_json->'properties'->'remarks',
              'sanction_received_date',schema_json->'properties'->'sanction_received_date'
            ))
          )
        ),
      'properties', jsonb_strip_nulls(jsonb_build_object(
        'drawing_details', '{"$ref":"#/$defs/DrawingDetails"}'::jsonb,
        'sanction',        '{"$ref":"#/$defs/Sanction"}'::jsonb,
        'approval_chain',  schema_json->'properties'->'approval_chain'
      ))
    )
  ),

  -- Rebuild ui_schema: nest widget hints under each section key
  ui_schema_json = jsonb_build_object(
    'drawing_details', jsonb_build_object(
      'ui:order', '["record_name","section","station","initiation_date","drawing_number","chainage_from","chainage_to","description","revision","other_details"]'::jsonb,
      'chainage_from',   '{"ui:widget":"chainage"}'::jsonb,
      'chainage_to',     '{"ui:widget":"chainage"}'::jsonb,
      'initiation_date', '{"ui:widget":"date"}'::jsonb,
      'other_details',   '{"ui:widget":"textarea"}'::jsonb
    ),
    'sanction', jsonb_build_object(
      'ui:order', '["remarks","sanction_received_date"]'::jsonb,
      'remarks',               '{"ui:widget":"textarea"}'::jsonb,
      'sanction_received_date','{"ui:widget":"date"}'::jsonb
    ),
    'approval_chain', '{"ui:field":"approvalChain"}'::jsonb
  ),

  section_codes = ARRAY['drawing_details', 'sanction']

WHERE activity_type_code = 'DRAWING_APPROVAL';

-- ── Step 2: ESP — add concept_esp_difference to DrawingDetails ─────────────────

UPDATE form_definitions
SET
  schema_json = jsonb_set(
    schema_json,
    '{$defs,DrawingDetails,properties}',
    (schema_json->'$defs'->'DrawingDetails'->'properties') || '{
      "concept_esp_difference": {"type":"string","title":"Difference between Concept Plan and ESP"}
    }'::jsonb
  ),
  ui_schema_json = jsonb_set(
    jsonb_set(
      ui_schema_json,
      '{drawing_details,ui:order}',
      '["record_name","section","station","initiation_date","drawing_number","chainage_from","chainage_to","description","revision","concept_esp_difference","other_details"]'::jsonb
    ),
    '{drawing_details,concept_esp_difference}',
    '{"ui:widget":"textarea"}'::jsonb
  )
WHERE code = 'ESP_DRAWING_V1';

-- ── Step 3: Grade Condonation — add curve_details to DrawingDetails ────────────

UPDATE form_definitions
SET
  schema_json = jsonb_set(
    schema_json,
    '{$defs,DrawingDetails,properties}',
    (schema_json->'$defs'->'DrawingDetails'->'properties') || '{
      "curve_details": {"type":"string","title":"Curve Details"}
    }'::jsonb
  ),
  ui_schema_json = jsonb_set(
    jsonb_set(
      ui_schema_json,
      '{drawing_details,ui:order}',
      '["record_name","section","station","initiation_date","drawing_number","chainage_from","chainage_to","description","revision","curve_details","other_details"]'::jsonb
    ),
    '{drawing_details,curve_details}',
    '{"ui:widget":"textarea"}'::jsonb
  )
WHERE code = 'GRADE_CONDONATION_DRAWING_V1';

-- ── Step 4: Migrate existing data_json from flat → nested ─────────────────────

UPDATE activity_records
SET data_json = jsonb_strip_nulls(jsonb_build_object(
  'drawing_details', jsonb_strip_nulls(jsonb_build_object(
    'record_name',           data_json->'record_name',
    'section',               data_json->'section',
    'station',               data_json->'station',
    'initiation_date',       data_json->'initiation_date',
    'drawing_number',        data_json->'drawing_number',
    'chainage_from',         data_json->'chainage_from',
    'chainage_to',           data_json->'chainage_to',
    'description',           data_json->'description',
    'revision',              data_json->'revision',
    'concept_esp_difference',data_json->'concept_esp_difference',
    'curve_details',         data_json->'curve_details',
    'other_details',         data_json->'other_details'
  )),
  'sanction', jsonb_strip_nulls(jsonb_build_object(
    'remarks',               data_json->'remarks',
    'sanction_received_date',data_json->'sanction_received_date'
  )),
  'approval_chain',          data_json->'approval_chain',
  'observations',            data_json->'observations'
))
FROM form_definitions fd
WHERE activity_records.form_definition_id = fd.id
  AND fd.activity_type_code = 'DRAWING_APPROVAL';
