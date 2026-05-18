-- V003_002__seed_form_definition_stub.sql
-- Phase 1.5: minimal Land Acquisition stub form definition.
--
-- This is a deliberately small schema used to prove:
--   1. form_definitions rows round-trip through GET correctly.
--   2. JSON Schema validation rejects invalid data with structured errors.
--
-- Phase 1.10 replaces this with the full 9-section LAND_ACQUISITION_V1 schema.

INSERT INTO form_definitions (
    id,
    activity_type_code,
    code,
    version,
    label,
    schema_json,
    ui_schema_json,
    section_codes,
    is_active
) VALUES (
    'ffffffff-0001-0001-0001-000000000001',
    'LAND_ACQUISITION',
    'LAND_ACQUISITION_V1',
    1,
    'Land Acquisition Record (Phase 1.5 stub)',
    '{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "$id": "https://pia.tracker/schemas/land_acquisition/LAND_ACQUISITION_V1/1.json",
      "type": "object",
      "title": "Land Acquisition Record",
      "description": "Per-village land acquisition data (Phase 1.5 stub — full schema in Phase 1.10)",
      "required": ["village_name", "village_chainage_from", "village_chainage_to"],
      "properties": {
        "village_name": {
          "type": "string",
          "minLength": 1,
          "maxLength": 256,
          "description": "Name of the revenue village"
        },
        "village_chainage_from": {
          "type": "string",
          "pattern": "^[0-9]+\\+[0-9]{3}$",
          "description": "Chainage start of the village boundary (KM+M format, e.g. 132+450)"
        },
        "village_chainage_to": {
          "type": "string",
          "pattern": "^[0-9]+\\+[0-9]{3}$",
          "description": "Chainage end of the village boundary (KM+M format)"
        },
        "district": {
          "type": "string",
          "maxLength": 128,
          "description": "Revenue district name"
        },
        "area_hectares_total": {
          "type": "string",
          "pattern": "^[0-9]+(\\.[0-9]{1,4})?$",
          "description": "Total area to be acquired (hectares, 4 dp)"
        }
      },
      "additionalProperties": false
    }'::jsonb,
    '{
      "ui:order": [
        "village_name",
        "village_chainage_from",
        "village_chainage_to",
        "district",
        "area_hectares_total"
      ],
      "village_chainage_from": { "ui:widget": "chainage" },
      "village_chainage_to":   { "ui:widget": "chainage" }
    }'::jsonb,
    '{}',
    true
);
