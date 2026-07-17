-- V106: Reorder Acquisition Details so Private/Govt/Forest/Total Area land in
-- that sequence on their own row (paired with the FIELD_ROW_GROUPS entry added
-- in the frontend). Total Area is auto-filled as Private+Govt+Forest client-side
-- (RecordEditPage.tsx) but stays editable — no schema change needed for that.

UPDATE form_definitions
SET ui_schema_json = jsonb_set(
    ui_schema_json,
    '{acquisition_details,ui:order}',
    '["record_name", "block_section_from", "block_section_to", "district", "sub_division_taluka",
      "area_hectares_private", "area_hectares_govt", "area_hectares_forest", "area_hectares_total",
      "est_villages"]'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';
