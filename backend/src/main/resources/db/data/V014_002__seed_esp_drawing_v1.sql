-- V014_002__seed_esp_drawing_v1.sql
-- Phase 2.5: Minimal ESP (Earthwork / Slope Protection) drawing form definition.
--
-- Drawing forms have:
--   workflow_definition_id = null  (drawings do NOT use the workflow engine)
--   section_codes          = '{}'  (no sections; drawing uses the checklist model)
--   default_approver_designations = ARRAY of designation codes in approval order
--
-- ESP drawings require SR_DEN then DY_CEE sign-off.
-- Both designations exist in V001_003; both are seeded with ROLE_APPROVER_GENERIC.

INSERT INTO form_definitions (
    id,
    activity_type_code,
    code,
    version,
    label,
    workflow_definition_id,
    section_codes,
    default_approver_designations,
    is_active,
    schema_json,
    ui_schema_json
) VALUES (
    'ffffffff-0006-0001-0001-000000000001',
    'DRAWING_APPROVAL',
    'ESP_DRAWING_V1',
    1,
    'ESP Drawing v1',
    null,
    '{}',
    ARRAY['SR_DEN', 'DY_CEE'],
    true,
    $schema$
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://pia.tracker/schemas/drawing/ESP_DRAWING_V1/1.json",
  "type": "object",
  "title": "ESP Drawing",
  "description": "Earthwork / Slope Protection drawing. Approved via the drawing checklist model (SR DEN → Dy CEE).",
  "required": ["drawing_number", "chainage_from", "chainage_to"],
  "additionalProperties": false,
  "properties": {
    "drawing_number": {
      "type": "string",
      "title": "Drawing Number",
      "minLength": 1,
      "maxLength": 64
    },
    "chainage_from": {
      "$ref": "#/$defs/Chainage",
      "title": "Chainage From"
    },
    "chainage_to": {
      "$ref": "#/$defs/Chainage",
      "title": "Chainage To"
    },
    "description": {
      "type": "string",
      "title": "Drawing Description",
      "maxLength": 2048
    },
    "revision": {
      "type": "integer",
      "title": "Revision Number",
      "minimum": 0
    }
  },
  "$defs": {
    "Chainage": {
      "type": "string",
      "pattern": "^[0-9]+\\+[0-9]{3}$"
    }
  }
}
$schema$,
    $ui_schema$
{
  "ui:order": [
    "drawing_number",
    "chainage_from",
    "chainage_to",
    "description",
    "revision"
  ],
  "chainage_from": { "ui:widget": "chainage" },
  "chainage_to":   { "ui:widget": "chainage" }
}
$ui_schema$
);
