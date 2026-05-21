-- V013_001__seed_forest_clearance_v1.sql
-- Phase 2.4: seed the FOREST_CLEARANCE_V1 form definition.
--
-- Three stages with independent SECTION_STANDARD_V1 workflow instances:
--   stage_i        — Submission & In-Principle Approval
--   stage_ii       — Final Approval
--   post_approval  — Post-Approval compliance
--
-- Top-level required fields: forest_division_name, forest_area_hectares,
--   project_chainage_from, project_chainage_to.
--
-- Each stage captures: progress booleans + dates, a queries[] array
-- (date submitted / date returned / remark per back-and-forth with the
-- approving authority), and stage-specific closure fields.

INSERT INTO form_definitions (
    id,
    activity_type_code,
    code,
    version,
    label,
    workflow_definition_id,
    section_codes,
    is_active,
    schema_json,
    ui_schema_json
) VALUES (
    'ffffffff-0005-0001-0001-000000000001',
    'FOREST_CLEARANCE',
    'FOREST_CLEARANCE_V1',
    1,
    'Forest Clearance Record v1',
    'bbbbbbbb-0001-0001-0001-000000000002',  -- SECTION_STANDARD_V1
    ARRAY['stage_i', 'stage_ii', 'post_approval'],
    true,
    $schema$
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://pia.tracker/schemas/forest_clearance/FOREST_CLEARANCE_V1/1.json",
  "type": "object",
  "title": "Forest Clearance Record",
  "description": "Three-stage forest clearance approval. Each stage has an independent SECTION_STANDARD_V1 workflow instance.",
  "required": ["forest_division_name", "forest_area_hectares", "project_chainage_from", "project_chainage_to"],
  "additionalProperties": false,
  "properties": {
    "forest_division_name": {
      "type": "string",
      "title": "Forest Division Name",
      "minLength": 1,
      "maxLength": 256
    },
    "forest_area_hectares": {
      "type": "number",
      "title": "Forest Area (hectares)",
      "minimum": 0
    },
    "project_chainage_from": {
      "$ref": "#/$defs/Chainage",
      "title": "Project Chainage From"
    },
    "project_chainage_to": {
      "$ref": "#/$defs/Chainage",
      "title": "Project Chainage To"
    },
    "stage_i":       { "$ref": "#/$defs/StageI" },
    "stage_ii":      { "$ref": "#/$defs/StageII" },
    "post_approval": { "$ref": "#/$defs/PostApproval" }
  },
  "$defs": {
    "Chainage": {
      "type": "string",
      "pattern": "^[0-9]+\\+[0-9]{3}$"
    },
    "QueryEntry": {
      "type": "object",
      "title": "Query",
      "required": ["submitted_on"],
      "additionalProperties": false,
      "properties": {
        "submitted_on": { "type": "string", "format": "date", "title": "Query Submitted On" },
        "returned_on":  { "type": "string", "format": "date", "title": "Query Returned On"  },
        "remark":       { "type": "string", "title": "Remark", "maxLength": 1024 }
      }
    },
    "StageI": {
      "type": "object",
      "title": "Stage I — Submission & In-Principle Approval",
      "additionalProperties": false,
      "properties": {
        "proposal_submitted_on_parivesh": {
          "type": "boolean",
          "title": "Proposal Submitted on PARIVESH?"
        },
        "proposal_submitted_date": {
          "type": "string",
          "format": "date",
          "title": "Proposal Submission Date"
        },
        "scrutiny_by_dfo": {
          "type": "boolean",
          "title": "Scrutiny by DFO Completed?"
        },
        "scrutiny_date": {
          "type": "string",
          "format": "date",
          "title": "Scrutiny Date"
        },
        "site_inspection": {
          "type": "boolean",
          "title": "Site Inspection Conducted?"
        },
        "site_inspection_date": {
          "type": "string",
          "format": "date",
          "title": "Site Inspection Date"
        },
        "inspection_report_pdf": {
          "type": "string",
          "format": "uuid",
          "title": "Inspection Report (PDF attachment ID)"
        },
        "in_principle_approval": {
          "type": "boolean",
          "title": "In-Principle Approval Received?"
        },
        "in_principle_approval_date": {
          "type": "string",
          "format": "date",
          "title": "In-Principle Approval Date"
        },
        "stipulated_conditions": {
          "type": "string",
          "title": "Stipulated Conditions",
          "maxLength": 4096
        },
        "queries": {
          "type": "array",
          "title": "Queries from Approving Authority",
          "items": { "$ref": "#/$defs/QueryEntry" }
        }
      }
    },
    "StageII": {
      "type": "object",
      "title": "Stage II — Final Approval",
      "additionalProperties": false,
      "properties": {
        "compliance_submitted_on": {
          "type": "string",
          "format": "date",
          "title": "Compliance Submitted On"
        },
        "state_recommendation_forwarded_on": {
          "type": "string",
          "format": "date",
          "title": "State Recommendation Forwarded On"
        },
        "final_approval_on": {
          "type": "string",
          "format": "date",
          "title": "Final Approval On"
        },
        "final_approval_pdf": {
          "type": "string",
          "format": "uuid",
          "title": "Final Approval Order (PDF attachment ID)"
        },
        "queries": {
          "type": "array",
          "title": "Queries from Approving Authority",
          "items": { "$ref": "#/$defs/QueryEntry" }
        }
      }
    },
    "PostApproval": {
      "type": "object",
      "title": "Post-Approval",
      "additionalProperties": false,
      "properties": {
        "formal_order_issued_on": {
          "type": "string",
          "format": "date",
          "title": "Formal Order Issued On"
        },
        "tree_felling_started_on": {
          "type": "string",
          "format": "date",
          "title": "Tree Felling Started On"
        },
        "compensatory_afforestation_initiated_on": {
          "type": "string",
          "format": "date",
          "title": "Compensatory Afforestation Initiated On"
        },
        "queries": {
          "type": "array",
          "title": "Queries from Approving Authority",
          "items": { "$ref": "#/$defs/QueryEntry" }
        }
      }
    }
  }
}
$schema$,
    $ui_schema$
{
  "ui:order": [
    "forest_division_name",
    "forest_area_hectares",
    "project_chainage_from",
    "project_chainage_to",
    "stage_i",
    "stage_ii",
    "post_approval"
  ],
  "project_chainage_from": { "ui:widget": "chainage" },
  "project_chainage_to":   { "ui:widget": "chainage" },
  "stage_i": {
    "ui:title": "Stage I — Submission & In-Principle Approval",
    "ui:order": [
      "proposal_submitted_on_parivesh",
      "proposal_submitted_date",
      "scrutiny_by_dfo",
      "scrutiny_date",
      "site_inspection",
      "site_inspection_date",
      "inspection_report_pdf",
      "in_principle_approval",
      "in_principle_approval_date",
      "stipulated_conditions",
      "queries"
    ],
    "inspection_report_pdf": { "ui:widget": "attachment" }
  },
  "stage_ii": {
    "ui:title": "Stage II — Final Approval",
    "ui:order": [
      "compliance_submitted_on",
      "state_recommendation_forwarded_on",
      "final_approval_on",
      "final_approval_pdf",
      "queries"
    ],
    "final_approval_pdf": { "ui:widget": "attachment" }
  },
  "post_approval": {
    "ui:title": "Post-Approval",
    "ui:order": [
      "formal_order_issued_on",
      "tree_felling_started_on",
      "compensatory_afforestation_initiated_on",
      "queries"
    ]
  }
}
$ui_schema$
);
