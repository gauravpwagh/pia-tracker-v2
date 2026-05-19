-- V007_001__land_acquisition_v1_full.sql
-- Phase 1.10: Replace the Phase 1.5 stub LAND_ACQUISITION_V1 form definition
-- with the full 9-section schema including all field types and the complete
-- RJSF ui-schema.
--
-- The existing row (id = ffffffff-0001-0001-0001-000000000001) is updated
-- in-place to preserve all FK references from activity_records rows created
-- during development.
--
-- section_codes drives:
--   1. The section-tab left-nav in the Record Edit Page.
--   2. The creation of 9 SECTION_STANDARD_V1 workflow_instances per record
--      (one per section) when ActivityService.createRecord() runs.
--
-- workflow_definition_id is set to SECTION_STANDARD_V1 so that the service
-- layer knows which definition to start instances for.

UPDATE form_definitions
SET
    label                  = 'Land Acquisition Record v1',
    workflow_definition_id = 'bbbbbbbb-0001-0001-0001-000000000002',  -- SECTION_STANDARD_V1
    section_codes          = ARRAY[
                                 'srp',
                                 'cala',
                                 'section_20a',
                                 'jmr',
                                 'section_20d',
                                 'section_20e',
                                 'section_20f_g',
                                 'section_20h_i',
                                 'mutation'
                             ],
    schema_json            = $schema$
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://pia.tracker/schemas/land_acquisition/LAND_ACQUISITION_V1/2.json",
  "type": "object",
  "title": "Land Acquisition Record",
  "description": "Per-village land acquisition data. Nine sections, each with independent workflow.",
  "required": ["village_name", "village_chainage_from", "village_chainage_to"],
  "additionalProperties": false,
  "properties": {
    "village_name":          { "type": "string", "title": "Village Name",          "minLength": 1, "maxLength": 256 },
    "village_chainage_from": { "$ref": "#/$defs/Chainage", "title": "Chainage From" },
    "village_chainage_to":   { "$ref": "#/$defs/Chainage", "title": "Chainage To"   },
    "district":              { "type": "string", "title": "District",               "maxLength": 128 },
    "sub_division_taluka":   { "type": "string", "title": "Sub-Division / Taluka",  "maxLength": 128 },
    "area_hectares_total":   { "type": "number", "title": "Total Area (ha)",        "minimum": 0 },
    "area_hectares_private": { "type": "number", "title": "Private Land Area (ha)", "minimum": 0 },
    "area_hectares_govt":    { "type": "number", "title": "Govt. Land Area (ha)",   "minimum": 0 },
    "area_hectares_forest":  { "type": "number", "title": "Forest Land Area (ha)",  "minimum": 0 },
    "srp":          { "$ref": "#/$defs/SrpSection"    },
    "cala":         { "$ref": "#/$defs/CalaSection"   },
    "section_20a":  { "$ref": "#/$defs/Section20A"    },
    "jmr":          { "$ref": "#/$defs/JmrSection"    },
    "section_20d":  { "$ref": "#/$defs/Section20D"    },
    "section_20e":  { "$ref": "#/$defs/Section20E"    },
    "section_20f_g":{ "$ref": "#/$defs/Section20FG"   },
    "section_20h_i":{ "$ref": "#/$defs/Section20HI"   },
    "mutation":     { "$ref": "#/$defs/MutationSection"}
  },
  "$defs": {
    "Chainage": {
      "type": "string",
      "pattern": "^[0-9]+\\+[0-9]{3}$",
      "description": "Railway chainage in KM+M format, e.g. 132+450"
    },
    "GazetteReference": {
      "type": "object",
      "title": "Gazette Reference",
      "properties": {
        "published_on":      { "type": "string", "format": "date",  "title": "Published On"    },
        "gaz_number":        { "type": "string", "maxLength": 64,   "title": "Gazette Number"  },
        "pdf_attachment_id": { "type": "string", "format": "uuid",  "title": "Gazette PDF"     }
      },
      "additionalProperties": false
    },
    "SrpSection": {
      "type": "object",
      "title": "SRP — Survey & Reconnaissance",
      "properties": {
        "srp_declared_in_gaz_on": { "type": "string", "format": "date",        "title": "SRP Declared in Gazette On" },
        "srp_gazette":            { "$ref": "#/$defs/GazetteReference",         "title": "SRP Gazette"                }
      },
      "additionalProperties": false
    },
    "CalaSection": {
      "type": "object",
      "title": "CALA — Certificate of Availability of Land",
      "properties": {
        "cala_received_from_state_on": { "type": "string", "format": "date",   "title": "CALA Received From State On" },
        "cala_publication_in_gaz":     { "$ref": "#/$defs/GazetteReference",   "title": "CALA Publication in Gazette" }
      },
      "additionalProperties": false
    },
    "Section20A": {
      "type": "object",
      "title": "Section 20A — Notification",
      "properties": {
        "notification_date":        { "type": "string", "format": "date",       "title": "Notification Date"          },
        "gazette_pub":              { "$ref": "#/$defs/GazetteReference",       "title": "Gazette Publication"        },
        "local_newspaper_pub_date": { "type": "string", "format": "date",       "title": "Local Newspaper Pub. Date"  },
        "local_newspaper_pdf":      { "type": "string", "format": "uuid",       "title": "Local Newspaper PDF"        }
      },
      "additionalProperties": false
    },
    "JmrSection": {
      "type": "object",
      "title": "JMR — Joint Measurement & Revenue",
      "properties": {
        "jmr_fee_demanded_on":  { "type": "string", "format": "date",           "title": "Fee Demanded On"            },
        "jmr_fee_amount":       { "type": "number", "minimum": 0,               "title": "Fee Amount (₹)"            },
        "jmr_fee_submitted_on": { "type": "string", "format": "date",           "title": "Fee Submitted On"           },
        "jmr_done_on":          { "type": "string", "format": "date",           "title": "JMR Done On"                },
        "revision_required":    { "type": "boolean",                            "title": "Revision Required?"         },
        "revision_reason":      { "type": "string",                             "title": "Reason for Revision"        }
      },
      "if":   { "properties": { "revision_required": { "const": true } }, "required": ["revision_required"] },
      "then": { "required": ["revision_reason"] },
      "additionalProperties": false
    },
    "Section20D": {
      "type": "object",
      "title": "Section 20D — Objections Hearing",
      "properties": {
        "objections_received":  { "type": "boolean",                            "title": "Objections Received?"       },
        "objections_summary":   { "type": "string",                             "title": "Summary of Objections"      },
        "hearing_date":         { "type": "string", "format": "date",           "title": "Hearing Date"               },
        "objections_pdf":       { "type": "string", "format": "uuid",           "title": "Objections PDF"             }
      },
      "additionalProperties": false
    },
    "Section20E": {
      "type": "object",
      "title": "Section 20E — Declaration",
      "properties": {
        "declaration_gazette":      { "$ref": "#/$defs/GazetteReference",       "title": "Declaration Gazette"        },
        "local_newspaper_pub_date": { "type": "string", "format": "date",       "title": "Local Newspaper Pub. Date"  }
      },
      "additionalProperties": false
    },
    "Section20FG": {
      "type": "object",
      "title": "Section 20F-G — Compensation Determination",
      "properties": {
        "competent_authority":        { "type": "string", "maxLength": 256,     "title": "Competent Authority"        },
        "compensation_determined_on": { "type": "string", "format": "date",     "title": "Compensation Determined On" },
        "compensation_amount":        { "type": "number", "minimum": 0,         "title": "Compensation Amount (₹)"   },
        "market_value_basis":         { "type": "string",                       "title": "Market Value Basis"         }
      },
      "additionalProperties": false
    },
    "Section20HI": {
      "type": "object",
      "title": "Section 20H-I — Payment & Possession",
      "properties": {
        "payment_made_to":    { "type": "string", "maxLength": 256,             "title": "Payment Made To"            },
        "payment_date":       { "type": "string", "format": "date",             "title": "Payment Date"               },
        "possession_given_on":{ "type": "string", "format": "date",             "title": "Possession Given On"        },
        "possession_pdf":     { "type": "string", "format": "uuid",             "title": "Possession Order PDF"       }
      },
      "additionalProperties": false
    },
    "MutationSection": {
      "type": "object",
      "title": "Mutation",
      "properties": {
        "mutation_done_on":         { "type": "string", "format": "date",       "title": "Mutation Done On"           },
        "revenue_records_updated":  { "type": "boolean",                        "title": "Revenue Records Updated?"   },
        "land_plan_approved":       { "type": "boolean",                        "title": "Land Plan Approved?"        },
        "mutation_certificate":     { "type": "string", "format": "uuid",       "title": "Mutation Certificate"       },
        "arbitration_required":     { "type": "boolean",                        "title": "Arbitration Required?"      },
        "arbitration_notes":        { "type": "string",                         "title": "Arbitration Notes"          }
      },
      "if":   { "properties": { "arbitration_required": { "const": true } }, "required": ["arbitration_required"] },
      "then": { "required": ["arbitration_notes"] },
      "additionalProperties": false
    }
  }
}
$schema$::jsonb,
    ui_schema_json         = $uischema$
{
  "ui:order": [
    "village_name", "village_chainage_from", "village_chainage_to",
    "district", "sub_division_taluka",
    "area_hectares_total", "area_hectares_private", "area_hectares_govt", "area_hectares_forest",
    "srp", "cala", "section_20a", "jmr", "section_20d", "section_20e",
    "section_20f_g", "section_20h_i", "mutation"
  ],
  "village_chainage_from": { "ui:widget": "chainage" },
  "village_chainage_to":   { "ui:widget": "chainage" },
  "srp": {
    "ui:title": "SRP — Survey & Reconnaissance",
    "ui:order": ["srp_declared_in_gaz_on", "srp_gazette"],
    "srp_gazette": { "ui:widget": "gazette_reference" }
  },
  "cala": {
    "ui:title": "CALA — Certificate of Availability of Land",
    "ui:order": ["cala_received_from_state_on", "cala_publication_in_gaz"],
    "cala_publication_in_gaz": { "ui:widget": "gazette_reference" }
  },
  "section_20a": {
    "ui:title": "Section 20A — Notification",
    "ui:order": ["notification_date", "gazette_pub", "local_newspaper_pub_date", "local_newspaper_pdf"],
    "gazette_pub":         { "ui:widget": "gazette_reference" },
    "local_newspaper_pdf": { "ui:widget": "attachment" }
  },
  "jmr": {
    "ui:title": "JMR — Joint Measurement & Revenue",
    "ui:order": ["jmr_fee_demanded_on", "jmr_fee_amount", "jmr_fee_submitted_on", "jmr_done_on", "revision_required", "revision_reason"]
  },
  "section_20d": {
    "ui:title": "Section 20D — Objections Hearing",
    "ui:order": ["objections_received", "objections_summary", "hearing_date", "objections_pdf"],
    "objections_pdf": { "ui:widget": "attachment" }
  },
  "section_20e": {
    "ui:title": "Section 20E — Declaration",
    "ui:order": ["declaration_gazette", "local_newspaper_pub_date"],
    "declaration_gazette": { "ui:widget": "gazette_reference" }
  },
  "section_20f_g": {
    "ui:title": "Section 20F-G — Compensation Determination",
    "ui:order": ["competent_authority", "compensation_determined_on", "compensation_amount", "market_value_basis"]
  },
  "section_20h_i": {
    "ui:title": "Section 20H-I — Payment & Possession",
    "ui:order": ["payment_made_to", "payment_date", "possession_given_on", "possession_pdf"],
    "possession_pdf": { "ui:widget": "attachment" }
  },
  "mutation": {
    "ui:title": "Mutation",
    "ui:order": ["mutation_done_on", "revenue_records_updated", "land_plan_approved", "mutation_certificate", "arbitration_required", "arbitration_notes"],
    "mutation_certificate": { "ui:widget": "attachment" }
  }
}
$uischema$::jsonb
WHERE id = 'ffffffff-0001-0001-0001-000000000001';
