-- PIA Tracker — V006: Create project_activities and expand activity_records.
--
-- V004 seeded a minimal activity_records stub (id, record_state) so the
-- workflow engine could reference it.  This migration:
--   1. Creates the project_activities table (new in Phase 1.8).
--   2. Expands activity_records with all remaining columns via ALTER TABLE.
--
-- The activity_records stub has zero data rows, so NOT NULL columns without a
-- DEFAULT are legal — Postgres only rejects them when existing rows would be
-- set to NULL.

-- ─────────────────────────────────────────────────────────────────────────────
-- project_activities  (new table)
-- ─────────────────────────────────────────────────────────────────────────────
-- Each row is one work-package under a project: e.g. "Phase 1 Land Acquisition".
-- Multiple activities of the same type on one project are allowed (decision YYY).

CREATE TABLE project_activities (
    id                             UUID         NOT NULL DEFAULT gen_random_uuid(),
    project_id                     UUID         NOT NULL REFERENCES projects (id),
    activity_type_code             VARCHAR(64)  NOT NULL REFERENCES activity_types (code),
    name                           VARCHAR(256) NOT NULL,
    scope_notes                    TEXT,
    target_completion_date         DATE,
    primary_dyce_user_id           UUID         NOT NULL REFERENCES users (id),
    -- NOT_STARTED / IN_PROGRESS / COMPLETED / ON_HOLD / CANCELLED
    status                         VARCHAR(32)  NOT NULL DEFAULT 'NOT_STARTED',
    -- Form and workflow defaults used when creating records under this activity.
    -- Null until the relevant phase seeds the full form definition.
    default_form_definition_id     UUID         REFERENCES form_definitions (id),
    default_workflow_definition_id UUID         REFERENCES workflow_definitions (id),
    metadata_json                  JSONB        NOT NULL DEFAULT '{}'::JSONB,
    -- audit + soft delete + optimistic lock
    created_at                     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by_user_id             UUID         NOT NULL REFERENCES users (id),
    updated_at                     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_by_user_id             UUID         REFERENCES users (id),
    is_deleted                     BOOLEAN      NOT NULL DEFAULT FALSE,
    deleted_at                     TIMESTAMPTZ,
    deleted_by_user_id             UUID         REFERENCES users (id),
    version                        INTEGER      NOT NULL DEFAULT 0,

    CONSTRAINT pk_project_activities PRIMARY KEY (id)
);

-- Hot path: list activities for a project.
CREATE INDEX ix_pact_project     ON project_activities (project_id)            WHERE NOT is_deleted;
-- Inbox queries: find activities owned by a given Dy CE/C.
CREATE INDEX ix_pact_dyce        ON project_activities (primary_dyce_user_id)  WHERE NOT is_deleted;
-- Dashboard roll-ups by activity type + status.
CREATE INDEX ix_pact_type_status ON project_activities (activity_type_code, status);

CREATE TRIGGER trg_project_activities_updated_at
    BEFORE UPDATE ON project_activities
    FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- activity_records  (expand stub from V004)
-- ─────────────────────────────────────────────────────────────────────────────
-- V004 created:  id uuid pk,  record_state varchar(32) not null default 'DRAFT'
-- The stub has zero data rows.  NOT NULL columns without a DEFAULT are safe on
-- an empty table — Postgres raises an error only when existing rows would get NULL.

ALTER TABLE activity_records
    ADD COLUMN project_activity_id    UUID        NOT NULL REFERENCES project_activities (id),
    ADD COLUMN form_definition_id     UUID        NOT NULL REFERENCES form_definitions (id),
    ADD COLUMN workflow_definition_id UUID        REFERENCES workflow_definitions (id),
    ADD COLUMN data_json              JSONB       NOT NULL DEFAULT '{}'::JSONB,
    ADD COLUMN schema_version_at_save INTEGER     NOT NULL,
    ADD COLUMN record_subtype         VARCHAR(64),
    ADD COLUMN created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN created_by_user_id     UUID        NOT NULL REFERENCES users (id),
    ADD COLUMN updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN updated_by_user_id     UUID        REFERENCES users (id),
    ADD COLUMN is_deleted             BOOLEAN     NOT NULL DEFAULT FALSE,
    ADD COLUMN deleted_at             TIMESTAMPTZ,
    ADD COLUMN deleted_by_user_id     UUID        REFERENCES users (id),
    ADD COLUMN version                INTEGER     NOT NULL DEFAULT 0;

-- Indexes on the expanded columns
CREATE INDEX ix_ar_activity ON activity_records (project_activity_id) WHERE NOT is_deleted;
CREATE INDEX ix_ar_state    ON activity_records (record_state)         WHERE NOT is_deleted;
CREATE INDEX ix_ar_subtype  ON activity_records (record_subtype)       WHERE NOT is_deleted;
CREATE INDEX gin_ar_data    ON activity_records USING GIN (data_json);

CREATE TRIGGER trg_activity_records_updated_at
    BEFORE UPDATE ON activity_records
    FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();
