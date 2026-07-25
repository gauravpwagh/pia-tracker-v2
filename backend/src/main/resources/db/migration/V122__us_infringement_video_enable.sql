-- V119: Utility Shifting — enable video upload on infringement_media.
-- Widens accept to include ACCEPT_VIDEO's MIME types (see AttachmentPanel.tsx)
-- and drops secondaryUploadLabel/secondaryUploadHint, folding the disabled
-- "Attach video" placeholder from V117 back into the single live upload
-- button. Upload itself needs no new plumbing: AttachmentWidget already goes
-- through AttachmentPanel -> uploadFile(), which already honours the WAF-safe
-- proxy path (VITE_WAF_PROXY_UPLOAD / AttachmentService.uploadProxy) used by
-- every other attachment field. See V113/V117 comments for the prior state.

UPDATE form_definitions
SET ui_schema_json = jsonb_set(
  ui_schema_json,
  '{infringement_media}',
  '{
    "ui:widget": "attachment",
    "ui:options": {
      "scopeToField": true,
      "accept": "image/jpeg,image/png,image/tiff,image/geo+tiff,image/geotiff,video/mp4,video/quicktime,video/x-matroska,video/x-msvideo,video/mpeg",
      "uploadLabel": "Attach photo/video",
      "uploadHint": "Photos and video of the infringement"
    }
  }'::jsonb
)
WHERE code = 'UTILITY_SHIFTING_V1';
