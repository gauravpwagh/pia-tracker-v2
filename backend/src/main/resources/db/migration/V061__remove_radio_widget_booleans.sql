-- V061: Remove "ui:widget": "radio" from all boolean fields so they use
-- the default CheckboxWidget (YesNoWidget / Switch) instead of radio buttons.

-- Utility Shifting
UPDATE form_definitions
SET ui_schema_json = ui_schema_json
  - 'material_available'
  - 'agency_available'
  - 'consent_state_govt'
  || jsonb_build_object(
       'material_available', '{}'::jsonb,
       'agency_available',   '{}'::jsonb,
       'consent_state_govt', '{}'::jsonb
     )
WHERE code = 'UTILITY_SHIFTING_V1';

-- Temporary Office Space
UPDATE form_definitions
SET ui_schema_json = ui_schema_json
  - 'agency_available'
  - 'possession_given'
  - 'rental_agreement'
  || jsonb_build_object(
       'agency_available', '{}'::jsonb,
       'possession_given', '{}'::jsonb,
       'rental_agreement', '{}'::jsonb
     )
WHERE code = 'TEMPORARY_OFFICE_SPACE_V1';

-- Tender Packaging
UPDATE form_definitions
SET ui_schema_json = ui_schema_json
  - 'epc_document_prepared'
  - 'tender_finalized'
  || jsonb_build_object(
       'epc_document_prepared', '{}'::jsonb,
       'tender_finalized',      '{}'::jsonb
     )
WHERE code = 'TENDER_PACKAGING_V1';
