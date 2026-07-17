-- V107: Fix a bug introduced in V106 — its ui:order rewrite dropped
-- "chainage_from"/"chainage_to" (added by V072), which RJSF requires every
-- schema property to appear in. This caused a hard error opening Acquisition
-- Details: 'uiSchema order list does not contain properties chainage_from,
-- chainage_to'. Restores them in their original position (right after
-- block_section_from/to), keeping the Private/Govt/Forest/Total row from V106.

UPDATE form_definitions
SET ui_schema_json = jsonb_set(
    ui_schema_json,
    '{acquisition_details,ui:order}',
    '["record_name", "block_section_from", "block_section_to", "chainage_from", "chainage_to",
      "district", "sub_division_taluka",
      "area_hectares_private", "area_hectares_govt", "area_hectares_forest", "area_hectares_total",
      "est_villages"]'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';
