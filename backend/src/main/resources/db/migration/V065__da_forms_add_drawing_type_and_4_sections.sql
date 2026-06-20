-- V065: Drawing Approval forms — add drawing_type enum to DrawingDetails,
--       move remarks from Sanction to DrawingDetails, and expand
--       section_codes to 4 sections: drawing_details / approvals /
--       observations / sanction.
--
-- After this migration the RJSF section nav shows 4 steps.
-- "approvals" and "observations" are custom-component sections with no
-- corresponding schema $def — the frontend detects the missing property
-- and renders DrawingApproversPanel / DrawingObservationsPanel instead.

-- ── Shared constants ──────────────────────────────────────────────────────────

-- drawing_type field (same for all 23 forms)
DO $$
DECLARE
  v_drawing_type_field jsonb := '{
    "type": "string",
    "title": "Drawing Type",
    "enum": ["ESP","SIP","ST_LT_TOC","SWRD","SWR","FAT","SAT","RSP",
             "CABLE_ROUTE_PLAN","LOP","PROJECT_SHEET","GAD_MEGA","GAD_MAJOR",
             "GAD_MINOR","LWR_PLAN","GRADE_CONDONATION","BRIDGE_MINOR_SANCTION",
             "YARD_DISPENSATION","YARD_MINOR_SANCTION","STATION_BUILDING_GAD",
             "FOB_GAD_TAD","CURVE_DETAILS","TUNNEL_DESIGN"],
    "enumNames": ["ESP","SIP","ST/LT (TOC)","SWRD","SWR","FAT","SAT",
                  "Mini Diagram / RSP","CRP Cable Route Plan","LOP",
                  "Project Sheet","GAD (Mega)","GAD (Major)","GAD (Minor)",
                  "LWR Plan","Grade Condonation","Minor Sanction of Bridge",
                  "Dispensation of Yard","Minor Sanction of Yard",
                  "Station Building GAD","FOB","Curve Details","Tunnel Design"]
  }'::jsonb;

  v_dd_ui_order jsonb := '["record_name","drawing_type","section","station",
    "drawing_number","chainage_from","chainage_to","description","revision",
    "initiation_date","other_details","remarks"]'::jsonb;

  v_sanction_ui_order jsonb := '["sanction_received_date"]'::jsonb;

BEGIN

  -- ── Step 1: Update ALL 23 DA forms ────────────────────────────────────────

  UPDATE form_definitions
  SET
    -- (a) Add drawing_type to DrawingDetails, move remarks there, strip from Sanction
    schema_json = jsonb_set(
      jsonb_set(
        -- Remove remarks from Sanction
        jsonb_set(
          schema_json,
          '{$defs,Sanction,properties}',
          (schema_json->'$defs'->'Sanction'->'properties') - 'remarks'
        ),
        -- Add remarks + drawing_type to DrawingDetails
        '{$defs,DrawingDetails,properties}',
        (schema_json->'$defs'->'DrawingDetails'->'properties')
          || jsonb_build_object('drawing_type', v_drawing_type_field)
          || '{"remarks":{"type":"string","title":"Remarks"}}'::jsonb
      ),
      -- Remove required from Sanction if it references remarks
      '{$defs,Sanction}',
      (schema_json->'$defs'->'Sanction') - 'required'
    ),

    -- (b) Rebuild ui_schema with updated section keys
    ui_schema_json = jsonb_build_object(
      'drawing_details', jsonb_build_object(
        'ui:order',      v_dd_ui_order,
        'chainage_from', '{"ui:widget":"chainage"}'::jsonb,
        'chainage_to',   '{"ui:widget":"chainage"}'::jsonb,
        'initiation_date','{"ui:widget":"date"}'::jsonb,
        'other_details', '{"ui:widget":"textarea"}'::jsonb,
        'remarks',       '{"ui:widget":"textarea"}'::jsonb
      ),
      'sanction', jsonb_build_object(
        'ui:order',              v_sanction_ui_order,
        'sanction_received_date','{"ui:widget":"date"}'::jsonb
      ),
      'approval_chain', '{"ui:field":"approvalChain"}'::jsonb
    ),

    -- (c) Expand to 4 sections
    section_codes = ARRAY['drawing_details','approvals','observations','sanction']

  WHERE activity_type_code = 'DRAWING_APPROVAL';

  -- ── Step 2: ESP — put concept_esp_difference back + its ui order ──────────

  UPDATE form_definitions
  SET
    schema_json = jsonb_set(
      schema_json,
      '{$defs,DrawingDetails,properties}',
      (schema_json->'$defs'->'DrawingDetails'->'properties')
        || '{"concept_esp_difference":{"type":"string","title":"Difference between Concept Plan and ESP"}}'::jsonb
    ),
    ui_schema_json = jsonb_set(
      jsonb_set(
        ui_schema_json,
        '{drawing_details,ui:order}',
        '["record_name","drawing_type","section","station","drawing_number",
          "chainage_from","chainage_to","description","revision",
          "concept_esp_difference","initiation_date","other_details","remarks"]'::jsonb
      ),
      '{drawing_details,concept_esp_difference}',
      '{"ui:widget":"textarea"}'::jsonb
    )
  WHERE code = 'ESP_DRAWING_V1';

  -- ── Step 3: Grade Condonation — put curve_details back + its ui order ─────

  UPDATE form_definitions
  SET
    schema_json = jsonb_set(
      schema_json,
      '{$defs,DrawingDetails,properties}',
      (schema_json->'$defs'->'DrawingDetails'->'properties')
        || '{"curve_details":{"type":"string","title":"Curve Details"}}'::jsonb
    ),
    ui_schema_json = jsonb_set(
      jsonb_set(
        ui_schema_json,
        '{drawing_details,ui:order}',
        '["record_name","drawing_type","section","station","drawing_number",
          "chainage_from","chainage_to","description","revision",
          "curve_details","initiation_date","other_details","remarks"]'::jsonb
      ),
      '{drawing_details,curve_details}',
      '{"ui:widget":"textarea"}'::jsonb
    )
  WHERE code = 'GRADE_CONDONATION_DRAWING_V1';

END $$;

-- ── Step 4: Migrate existing record data_json ─────────────────────────────────
-- Move sanction.remarks → drawing_details.remarks; pre-populate drawing_type.

UPDATE activity_records ar
SET data_json = jsonb_strip_nulls(
  -- Update drawing_details: add drawing_type + absorb remarks from sanction
  jsonb_set(
    jsonb_set(
      ar.data_json,
      '{drawing_details}',
      COALESCE(ar.data_json->'drawing_details', '{}'::jsonb)
        || jsonb_strip_nulls(jsonb_build_object(
             'drawing_type', CASE fd.code
               WHEN 'ESP_DRAWING_V1'                   THEN 'ESP'
               WHEN 'SIP_DRAWING_V1'                   THEN 'SIP'
               WHEN 'ST_LT_TOC_DRAWING_V1'             THEN 'ST_LT_TOC'
               WHEN 'SWRD_DRAWING_V1'                  THEN 'SWRD'
               WHEN 'SWR_DRAWING_V1'                   THEN 'SWR'
               WHEN 'FAT_DRAWING_V1'                   THEN 'FAT'
               WHEN 'SAT_DRAWING_V1'                   THEN 'SAT'
               WHEN 'RSP_DRAWING_V1'                   THEN 'RSP'
               WHEN 'CABLE_ROUTE_PLAN_DRAWING_V1'      THEN 'CABLE_ROUTE_PLAN'
               WHEN 'LOP_DRAWING_V1'                   THEN 'LOP'
               WHEN 'PROJECT_SHEET_DRAWING_V1'         THEN 'PROJECT_SHEET'
               WHEN 'GAD_MEGA_DRAWING_V1'              THEN 'GAD_MEGA'
               WHEN 'GAD_MAJOR_DRAWING_V1'             THEN 'GAD_MAJOR'
               WHEN 'GAD_MINOR_DRAWING_V1'             THEN 'GAD_MINOR'
               WHEN 'LWR_PLAN_DRAWING_V1'              THEN 'LWR_PLAN'
               WHEN 'GRADE_CONDONATION_DRAWING_V1'     THEN 'GRADE_CONDONATION'
               WHEN 'BRIDGE_MINOR_SANCTION_DRAWING_V1' THEN 'BRIDGE_MINOR_SANCTION'
               WHEN 'YARD_DISPENSATION_DRAWING_V1'     THEN 'YARD_DISPENSATION'
               WHEN 'YARD_MINOR_SANCTION_DRAWING_V1'   THEN 'YARD_MINOR_SANCTION'
               WHEN 'STATION_BUILDING_GAD_DRAWING_V1'  THEN 'STATION_BUILDING_GAD'
               WHEN 'FOB_GAD_TAD_DRAWING_V1'           THEN 'FOB_GAD_TAD'
               WHEN 'CURVE_DETAILS_DRAWING_V1'         THEN 'CURVE_DETAILS'
               WHEN 'TUNNEL_DESIGN_DRAWING_V1'         THEN 'TUNNEL_DESIGN'
               ELSE NULL
             END,
             'remarks', ar.data_json->'sanction'->'remarks'
           ))
    ),
    -- Update sanction: remove remarks key
    '{sanction}',
    COALESCE(ar.data_json->'sanction', '{}'::jsonb) - 'remarks'
  )
)
FROM form_definitions fd
WHERE ar.form_definition_id = fd.id
  AND fd.activity_type_code = 'DRAWING_APPROVAL';
