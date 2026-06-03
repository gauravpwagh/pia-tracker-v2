-- V029: Redesign drawing_approvers to record-keeping model.
--
-- Previously: approvers were system users who logged in to click Approve/Send-Back.
-- Now: DY CE/C enters the date on which a physical sign-off was received from each
--      approving authority. No workflow, no user_id — just designation + date.
--
-- Dropped columns: user_id, status, acted_at, comment, chk_da_status constraint.
-- Added  columns:  approved_on DATE, remarks TEXT.
-- Dropped index:   ix_da_user_pending (was on user_id + status).

ALTER TABLE drawing_approvers
    DROP CONSTRAINT IF EXISTS chk_da_status,
    DROP COLUMN IF EXISTS user_id,
    DROP COLUMN IF EXISTS status,
    DROP COLUMN IF EXISTS acted_at,
    DROP COLUMN IF EXISTS comment,
    ADD COLUMN approved_on DATE,
    ADD COLUMN remarks     TEXT;

DROP INDEX IF EXISTS ix_da_user_pending;

-- New index: quickly find all approved rows for a record (approved_on IS NOT NULL).
CREATE INDEX ix_da_record_approved ON drawing_approvers(activity_record_id, approved_on)
    WHERE NOT is_deleted;
