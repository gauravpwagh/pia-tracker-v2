-- V111: Drawing Approval forms — remove date_sent_for_review, date_reviewed_by_officer,
-- date_of_approval, and days_taken_for_approval from the record-level Sanction
-- section (added in V109). These are now captured per sanctioning authority on
-- drawing_approvers (sent_for_review_on / reviewed_on, V110; approved_on already
-- existed; days-taken is computed, not stored) rather than once per record.
--
-- date_joint_survey and sanction_received_date remain record-level in Sanction.

UPDATE form_definitions
SET schema_json = jsonb_set(
  schema_json,
  '{$defs,Sanction,properties}',
  (schema_json -> '$defs' -> 'Sanction' -> 'properties')
    - 'date_sent_for_review'
    - 'date_reviewed_by_officer'
    - 'date_of_approval'
    - 'days_taken_for_approval'
)
WHERE activity_type_code = 'DRAWING_APPROVAL';

UPDATE form_definitions
SET ui_schema_json = jsonb_set(
  (ui_schema_json #- '{sanction,date_sent_for_review}'
                  #- '{sanction,date_reviewed_by_officer}'
                  #- '{sanction,date_of_approval}'),
  '{sanction,ui:order}',
  '["date_joint_survey","sanction_received_date"]'::jsonb
)
WHERE activity_type_code = 'DRAWING_APPROVAL';
