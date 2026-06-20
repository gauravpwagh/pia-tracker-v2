-- V052: Rewrite TOS record form schema with proper RJSF if/then conditional visibility.
--
-- Problems with the V042 schema:
--   1. All conditional fields (agency_available, possession_given, rental_agreement,
--      new_tdc, old_tdc, hiring_tdc) lived in top-level properties, so RJSF rendered
--      all of them regardless of the selected structure_type.
--   2. "location_description" was a textarea; user wants a plain text input named
--      "location" and it should appear first.
--
-- Solution:
--   - Top-level properties: location, structure_type, remarks only.
--   - Conditional properties (yes/no question + tdc) defined ONLY inside the
--     matching allOf/if/then branch. RJSF v5 renders then-properties only when
--     the corresponding if condition is satisfied.
--   - additionalProperties removed so then-block properties are not rejected.
--   - Boolean yes/no fields use oneOf so radio widget can show "Yes"/"No" labels.
--   - Single shared "tdc" field name across all branches (only one branch active
--     at a time, so there is no ambiguity).

UPDATE form_definitions
SET
  schema_json = '{
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "title": "Temporary Office Space Record",
    "required": ["location", "structure_type"],
    "properties": {
      "location": {
        "type": "string",
        "title": "Location",
        "minLength": 1,
        "maxLength": 512
      },
      "structure_type": {
        "type": "string",
        "title": "Type of Structure",
        "enum": ["NEW_REQUIRED", "OLD_AVAILABLE", "HIRING"]
      },
      "remarks": {
        "type": "string",
        "title": "Remarks"
      }
    },
    "allOf": [
      {
        "if": {
          "properties": { "structure_type": { "const": "NEW_REQUIRED" } },
          "required": ["structure_type"]
        },
        "then": {
          "properties": {
            "agency_available": {
              "type": "boolean",
              "title": "Agency Available?",
              "oneOf": [
                { "const": true,  "title": "Yes" },
                { "const": false, "title": "No"  }
              ]
            },
            "tdc": {
              "type": "string",
              "title": "Target Date of Completion",
              "format": "date"
            }
          }
        }
      },
      {
        "if": {
          "properties": { "structure_type": { "const": "OLD_AVAILABLE" } },
          "required": ["structure_type"]
        },
        "then": {
          "properties": {
            "possession_given": {
              "type": "boolean",
              "title": "Possession given by OL?",
              "oneOf": [
                { "const": true,  "title": "Yes" },
                { "const": false, "title": "No"  }
              ]
            },
            "tdc": {
              "type": "string",
              "title": "Target Date of Completion",
              "format": "date"
            }
          }
        }
      },
      {
        "if": {
          "properties": { "structure_type": { "const": "HIRING" } },
          "required": ["structure_type"]
        },
        "then": {
          "properties": {
            "rental_agreement": {
              "type": "boolean",
              "title": "Rental Agreement?",
              "oneOf": [
                { "const": true,  "title": "Yes" },
                { "const": false, "title": "No"  }
              ]
            },
            "tdc": {
              "type": "string",
              "title": "Target Date of Completion",
              "format": "date"
            }
          }
        }
      }
    ]
  }'::jsonb,

  ui_schema_json = '{
    "ui:order": [
      "location",
      "structure_type",
      "agency_available",
      "possession_given",
      "rental_agreement",
      "tdc",
      "remarks"
    ],
    "structure_type": {
      "ui:widget": "select",
      "ui:enumNames": ["New structure required", "Old structure available", "Hiring of structure"]
    },
    "agency_available":    { "ui:widget": "radio" },
    "possession_given":    { "ui:widget": "radio" },
    "rental_agreement":    { "ui:widget": "radio" },
    "tdc":                 { "ui:widget": "date" },
    "remarks":             { "ui:widget": "textarea" }
  }'::jsonb

WHERE code = 'TEMPORARY_OFFICE_SPACE_V1';
