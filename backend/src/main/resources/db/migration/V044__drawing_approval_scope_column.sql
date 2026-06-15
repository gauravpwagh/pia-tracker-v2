-- Add total_count scope column to drawing_approval_details.
-- Users now set the number of drawing approvals required on the activity (scope),
-- then create individual records — one per drawing.
ALTER TABLE drawing_approval_details
    ADD COLUMN IF NOT EXISTS total_count INTEGER;
