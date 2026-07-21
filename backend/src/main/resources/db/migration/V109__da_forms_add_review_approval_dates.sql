-- V109: Drawing Approval forms — add review/approval tracking fields to the
-- Sanction section (common to all 23 DA forms):
--   date_sent_for_review     — Date of Drawing sent for review
--   date_reviewed_by_officer — Date of review by concerned officer
--   date_joint_survey        — Date of joint survey, if required
--   date_of_approval         — Date of approval of drawing
--   days_taken_for_approval  — Number of days taken by concerned person for approval

UPDATE form_definitions
SET schema_json = jsonb_set(
  schema_json,
  '{$defs,Sanction,properties}',
  (schema_json -> '$defs' -> 'Sanction' -> 'properties') || '{
    "date_sent_for_review":     {"type": "string", "format": "date", "title": "Date of Drawing Sent for Review"},
    "date_reviewed_by_officer": {"type": "string", "format": "date", "title": "Date of Review by Concerned Officer"},
    "date_joint_survey":        {"type": "string", "format": "date", "title": "Date of Joint Survey (if required)"},
    "date_of_approval":         {"type": "string", "format": "date", "title": "Date of Approval of Drawing"},
    "days_taken_for_approval":  {"type": "integer", "minimum": 0, "title": "No. of Days Taken for Approval"}
  }'::jsonb
)
WHERE activity_type_code = 'DRAWING_APPROVAL';

UPDATE form_definitions
SET ui_schema_json = jsonb_set(
  ui_schema_json,
  '{sanction,ui:order}',
  '["date_sent_for_review","date_reviewed_by_officer","date_joint_survey",
    "date_of_approval","days_taken_for_approval","sanction_received_date"]'::jsonb
)
WHERE activity_type_code = 'DRAWING_APPROVAL';

UPDATE form_definitions
SET ui_schema_json = jsonb_set(
  jsonb_set(
    jsonb_set(
      ui_schema_json,
      '{sanction,date_sent_for_review}',
      '{"ui:widget":"date"}'::jsonb
    ),
    '{sanction,date_reviewed_by_officer}',
    '{"ui:widget":"date"}'::jsonb
  ),
  '{sanction,date_joint_survey}',
  '{"ui:widget":"date"}'::jsonb
)
WHERE activity_type_code = 'DRAWING_APPROVAL';

UPDATE form_definitions
SET ui_schema_json = jsonb_set(
  ui_schema_json,
  '{sanction,date_of_approval}',
  '{"ui:widget":"date"}'::jsonb
)
WHERE activity_type_code = 'DRAWING_APPROVAL';
