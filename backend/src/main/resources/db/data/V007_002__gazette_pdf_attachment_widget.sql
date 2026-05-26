-- V007_002__gazette_pdf_attachment_widget.sql
-- Wire the gazette PDF attachment fields in LAND_ACQUISITION_V1 to the
-- "attachment" widget so the UI renders a file-upload button instead of
-- a plain text UUID input.
--
-- Also removes the now-unused "ui:widget": "gazette_reference" hints on
-- gazette sub-objects (RJSF does not apply ui:widget to object-type fields;
-- the GazetteReferenceWidget is superseded by PiaObjectFieldTemplate +
-- individual field widgets).

UPDATE form_definitions
SET ui_schema_json = $uischema$
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
    "srp_gazette": {
      "ui:order": ["published_on", "gaz_number", "pdf_attachment_id"],
      "pdf_attachment_id": { "ui:widget": "attachment" }
    }
  },
  "cala": {
    "ui:title": "CALA — Certificate of Availability of Land",
    "ui:order": ["cala_received_from_state_on", "cala_publication_in_gaz"],
    "cala_publication_in_gaz": {
      "ui:order": ["published_on", "gaz_number", "pdf_attachment_id"],
      "pdf_attachment_id": { "ui:widget": "attachment" }
    }
  },
  "section_20a": {
    "ui:title": "Section 20A — Notification",
    "ui:order": ["notification_date", "gazette_pub", "local_newspaper_pub_date", "local_newspaper_pdf"],
    "gazette_pub": {
      "ui:order": ["published_on", "gaz_number", "pdf_attachment_id"],
      "pdf_attachment_id": { "ui:widget": "attachment" }
    },
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
    "declaration_gazette": {
      "ui:order": ["published_on", "gaz_number", "pdf_attachment_id"],
      "pdf_attachment_id": { "ui:widget": "attachment" }
    }
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
