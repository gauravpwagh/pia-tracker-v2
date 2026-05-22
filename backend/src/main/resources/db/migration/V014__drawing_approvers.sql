-- V014__drawing_approvers.sql
-- Phase 2.5: Drawing approver checklist table.
--
-- Drawings use a checklist model completely separate from the workflow engine.
-- Each row is one approver slot for a drawing (activity_record of type DRAWING_APPROVAL).
--
-- Overall drawing state is derived from these rows:
--   any SENT_BACK  → SENT_BACK
--   all APPROVED   → APPROVED
--   otherwise      → IN_APPROVAL   (or DRAFT if never submitted)
--
-- See docs/workflow.md § 5 and docs/database.md § 7 for the full spec.

CREATE TABLE drawing_approvers (
    id                        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_record_id        UUID         NOT NULL REFERENCES activity_records(id),
    approval_designation_code VARCHAR(32)  NOT NULL REFERENCES designations(code),
    user_id                   UUID         REFERENCES users(id),   -- null = slot not yet filled
    status                    VARCHAR(16)  NOT NULL DEFAULT 'PENDING',
    position                  INTEGER      NOT NULL DEFAULT 0,      -- display order only
    acted_at                  TIMESTAMPTZ,
    comment                   TEXT,
    is_deleted                BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_da_status CHECK (status IN ('PENDING', 'APPROVED', 'SENT_BACK'))
);

CREATE INDEX ix_da_record ON drawing_approvers(activity_record_id) WHERE NOT is_deleted;
CREATE INDEX ix_da_user_pending ON drawing_approvers(user_id, status)
    WHERE NOT is_deleted AND status = 'PENDING';

CREATE TRIGGER drawing_approvers_updated_at
    BEFORE UPDATE ON drawing_approvers
    FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();
