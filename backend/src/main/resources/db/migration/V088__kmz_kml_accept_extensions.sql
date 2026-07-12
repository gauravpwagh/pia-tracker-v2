-- V088: Restrict the file picker for the two geo-file attachment fields.
--   * LAND_ACQUISITION_V1  → checklist.kmz_file  accepts .KMZ only
--   * FOREST_CLEARANCE_V1  → ca_land.kml_file     accepts .KML only
-- Adds "accept" to each field's ui:options (extension pattern; the frontend
-- AttachmentPanel forwards it to <input accept> and the upload validator).
-- Existing ui:options (scopeToField) are preserved.

-- Land Acquisition — checklist.kmz_file
UPDATE form_definitions
SET ui_schema_json = jsonb_set(
    ui_schema_json,
    '{checklist,kmz_file,ui:options,accept}',
    '".KMZ"'::jsonb,
    true
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

-- Forest Clearance — ca_land.kml_file
UPDATE form_definitions
SET ui_schema_json = jsonb_set(
    ui_schema_json,
    '{ca_land,kml_file,ui:options,accept}',
    '".KML"'::jsonb,
    true
)
WHERE id = 'ffffffff-0005-0001-0001-000000000001';
