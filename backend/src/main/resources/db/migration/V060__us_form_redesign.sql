-- V060: Redesign UTILITY_SHIFTING_V1 form with new field set.
--
-- New fields: owner_agency, length_affected_km, status_drawing_execution,
--             target_removal_date, consent_state_govt
-- Removed: utility-type-specific fields (pole_count, span_length_m, etc.),
--          work_order_no, work_order_date, work_completed_on, completion_cert_pdf,
--          location_description, contractor_name, revetment_type, etc.
-- Kept:    executing_agency with its conditional fields (frontend-filtered)

UPDATE form_definitions
SET
  schema_json = '{
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "title": "Utility Shifting Record",
    "required": ["record_name", "utility_type", "chainage_from", "chainage_to", "executing_agency"],
    "properties": {
      "record_name": {
        "type": "string", "title": "Record Name", "minLength": 1, "maxLength": 256
      },
      "block_section": {
        "type": "string", "title": "Block / Section", "maxLength": 256
      },
      "utility_type": {
        "type": "string",
        "title": "Infringement / Utility Type",
        "enum": [
          "LT", "HT", "EHV",
          "PIPELINE_WATER", "PIPELINE_INFLAMMABLE", "PIPELINE_OTHER",
          "SNT_SIGNAL_TELECOM", "SNT_LOCATION_BOX", "SNT_SIGNAL_MAST", "SNT_IBH",
          "QUARTER", "STATION_BUILDING", "AQUEDUCT_CANAL", "ROAD",
          "TSS", "SS", "OHE_MAST"
        ]
      },
      "owner_agency": {
        "type": "string", "title": "Owner Agency", "maxLength": 256
      },
      "chainage_from": {
        "type": "string", "title": "Chainage From",
        "pattern": "^[0-9]+\\+[0-9]{3}$"
      },
      "chainage_to": {
        "type": "string", "title": "Chainage To",
        "pattern": "^[0-9]+\\+[0-9]{3}$"
      },
      "length_affected_km": {
        "type": "number", "title": "Length of Alignment Affected (Km)", "minimum": 0
      },
      "executing_agency": {
        "type": "string", "title": "Executing Agency",
        "enum": ["RAILWAY", "USER_DEPT", "OPEN_LINE", "CONSTRUCTION"]
      },
      "estimate_position": {
        "type": "string", "title": "Position of Estimate", "maxLength": 512
      },
      "fund_submission": {
        "type": "string", "title": "Fund Submission Date", "format": "date"
      },
      "material_available": {
        "type": "boolean", "title": "Material Available?"
      },
      "agency_available": {
        "type": "boolean", "title": "Executing Agency Available?"
      },
      "status_drawing_execution": {
        "type": "string", "title": "Status of Drawing and Execution Plan"
      },
      "target_removal_date": {
        "type": "string", "title": "Target Date for Removal", "format": "date"
      },
      "consent_state_govt": {
        "type": "boolean", "title": "Consent of State Govt. Obtained"
      },
      "remarks": {
        "type": "string", "title": "Remarks"
      }
    }
  }'::jsonb,
  ui_schema_json = '{
    "ui:order": [
      "record_name", "block_section",
      "utility_type", "owner_agency",
      "chainage_from", "chainage_to", "length_affected_km",
      "executing_agency",
      "estimate_position", "fund_submission",
      "material_available", "agency_available",
      "status_drawing_execution", "target_removal_date",
      "consent_state_govt", "remarks"
    ],
    "utility_type": {
      "ui:widget": "select",
      "ui:enumNames": [
        "LT", "HT", "EHV",
        "Pipeline (Water)", "Pipeline (Inflammable Material)", "Pipeline (Other)",
        "SNT Signal and Telecom Cable", "SNT Location Box", "SNT Signal Mast", "SNT IBH",
        "Quarter", "Station Building", "Aqueduct / Canal", "Road",
        "TSS", "SS", "OHE Mast"
      ]
    },
    "executing_agency": {
      "ui:widget": "select",
      "ui:enumNames": ["Railway (Construction)", "User Department", "Open Line", "Construction Organisation"]
    },
    "chainage_from":             { "ui:widget": "chainage" },
    "chainage_to":               { "ui:widget": "chainage" },
    "fund_submission":            { "ui:widget": "date" },
    "estimate_position":          { "ui:widget": "textarea" },
    "status_drawing_execution":   { "ui:widget": "textarea" },
    "material_available":         { "ui:widget": "radio" },
    "agency_available":           { "ui:widget": "radio" },
    "consent_state_govt":         { "ui:widget": "radio" },
    "remarks":                    { "ui:widget": "textarea" }
  }'::jsonb
WHERE code = 'UTILITY_SHIFTING_V1';
