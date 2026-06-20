-- V053: Add placeholder to TOS structure_type select to remove the blank first option.
--
-- RJSF renders a blank leading option on any select widget that has no default value.
-- Setting ui:placeholder replaces the blank with a labelled "Select..." prompt.

UPDATE form_definitions
SET ui_schema_json = ui_schema_json || '{
  "structure_type": {
    "ui:widget": "select",
    "ui:placeholder": "Select type of structure",
    "ui:enumNames": ["New structure required", "Old structure available", "Hiring of structure"]
  }
}'::jsonb
WHERE code = 'TEMPORARY_OFFICE_SPACE_V1';
