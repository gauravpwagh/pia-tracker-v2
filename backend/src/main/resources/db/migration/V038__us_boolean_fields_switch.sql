-- V038: Fix material_available and agency_available to use Switch (boolean default)
-- instead of select. Remove the ui:widget override so RJSF uses CheckboxWidget
-- which is mapped to the YesNoWidget (Switch) globally.

UPDATE form_definitions
SET ui_schema_json = ui_schema_json
  - 'material_available'
  - 'agency_available'
  || jsonb_build_object(
      'material_available', '{}'::jsonb,
      'agency_available',   '{}'::jsonb
    )
WHERE code = 'UTILITY_SHIFTING_V1';
