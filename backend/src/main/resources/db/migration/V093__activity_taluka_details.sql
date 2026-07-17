-- V093: Sub-Division/Taluka master for Land Acquisition.
--
-- Land Acquisition's SRP (survey & reconnaissance) and CALA (certificate of
-- availability of land) gazette details were previously entered per-record,
-- even though in practice they are determined once per Sub-Division/Taluka
-- and shared by every record under it. This table becomes the single place
-- to enter them; records reference a row here instead of re-entering the data.
--
-- One row per Sub-Division/Taluka within a single Land Acquisition activity
-- (uniqueness enforced per activity, not globally — decision: taluka master
-- is scoped per-project, matching how activity scope already works, see
-- HANDOVER discussion 2026-07-13).
--
-- Gazette PDFs are NOT stored as a column here — same convention as the
-- activity Scope checklist (LA_SCOPE_DOC_FIELDS in ProjectWorkspace.tsx):
-- the frontend points AttachmentPanel at entityType
-- 'ACTIVITY_TALUKA__srp_gazette' / 'ACTIVITY_TALUKA__cala_gazette' with
-- entityId = this row's id, and the generic attachments table is the source
-- of truth for the file itself.

CREATE TABLE activity_taluka_details (
    id                             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_activity_id           UUID NOT NULL REFERENCES project_activities(id),
    -- TEXT, not VARCHAR(n): this backfills from what used to be a free-text
    -- sub_division_taluka field on records with no length limit at all, so
    -- picking any bound here is a guess — V093_001's backfill from real VM
    -- data hit a value that blew past an earlier VARCHAR(128) guess.
    taluka_name                   TEXT NOT NULL,

    srp_declared_in_gaz_on        DATE,
    srp_gazette_published_on      DATE,
    srp_gazette_number            VARCHAR(64),

    cala_received_from_state_on   DATE,
    cala_gazette_published_on     DATE,
    cala_gazette_number           VARCHAR(64),

    created_by_user_id            UUID NOT NULL,
    updated_by_user_id            UUID,

    is_deleted                    BOOLEAN NOT NULL DEFAULT false,
    deleted_at                    TIMESTAMPTZ,
    deleted_by_user_id            UUID,

    created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
    version                       INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_activity_taluka_details_activity
    ON activity_taluka_details(project_activity_id)
    WHERE is_deleted = false;

-- One active taluka name per activity (case-insensitive).
CREATE UNIQUE INDEX uq_activity_taluka_details_name
    ON activity_taluka_details(project_activity_id, lower(taluka_name))
    WHERE is_deleted = false;
