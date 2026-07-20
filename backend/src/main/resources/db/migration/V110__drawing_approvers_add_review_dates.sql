-- V110: Drawing approvers — add per-authority review tracking dates.
-- Captures, per sanctioning authority (per drawing_approvers row):
--   sent_for_review_on — date the drawing was sent to this authority for review
--   reviewed_on        — date the concerned officer completed their review
-- "Date of approval" already exists as approved_on (V029); "days taken for
-- approval" is computed on read from (approved_on - sent_for_review_on), not stored.

ALTER TABLE drawing_approvers
    ADD COLUMN sent_for_review_on DATE,
    ADD COLUMN reviewed_on        DATE;

COMMENT ON COLUMN drawing_approvers.sent_for_review_on IS 'Date the drawing was sent to this authority for review.';
COMMENT ON COLUMN drawing_approvers.reviewed_on        IS 'Date the concerned officer completed their review.';
