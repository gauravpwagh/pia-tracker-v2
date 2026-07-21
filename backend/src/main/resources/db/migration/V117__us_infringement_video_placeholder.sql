-- V117: Utility Shifting — show a disabled "Attach video" button next to the
-- existing photo upload on infringement_media, so the capability is visible
-- ahead of time without being live yet. No schema_json / ui:order change —
-- this reuses the same field V113 already set up for "Photos and Video of
-- Infringement" (see V113's comment: video support is just widening accept
-- later, no new field needed). Actually enabling it later is: add
-- ACCEPT_VIDEO's MIME types to `accept` and drop `secondaryUploadLabel`.

UPDATE form_definitions
SET ui_schema_json = jsonb_set(
  ui_schema_json,
  '{infringement_media}',
  '{
    "ui:widget": "attachment",
    "ui:options": {
      "scopeToField": true,
      "accept": "image/jpeg,image/png,image/tiff,image/geo+tiff,image/geotiff",
      "uploadLabel": "Attach photo",
      "uploadHint": "Photos only for now",
      "secondaryUploadLabel": "Attach video",
      "secondaryUploadHint": "Video upload coming soon"
    }
  }'::jsonb
)
WHERE code = 'UTILITY_SHIFTING_V1';
