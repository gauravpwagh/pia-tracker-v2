-- V002__projects_stub.sql
-- Phase 1.4 stub for the projects table.
-- Only the columns needed to establish foreign-key targets and drive the
-- zone-scoped permission filter are added here.  Further columns (DPR
-- reference, estimated cost, activity linkage, etc.) will be added in
-- Phase 1.7 via ALTER TABLE migrations (V002_xxx__*).

CREATE TABLE projects (
    id          UUID         NOT NULL DEFAULT gen_random_uuid(),
    zone_id     UUID         NOT NULL,
    name        VARCHAR(256) NOT NULL,
    is_deleted  BOOLEAN      NOT NULL DEFAULT false,
    version     INTEGER      NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT pk_projects PRIMARY KEY (id),
    CONSTRAINT fk_projects_zone
        FOREIGN KEY (zone_id) REFERENCES zones (id)
);

-- Partial index: most project queries include WHERE NOT is_deleted.
-- Scoped to zone_id because the most common dashboard filter is
-- zone_id + NOT is_deleted (used by the permission evaluator for
-- PROJECT.READ.ZONE and PROJECT.READ.OWN).
CREATE INDEX ix_projects_zone_id
    ON projects (zone_id)
    WHERE NOT is_deleted;

-- Automatically maintain updated_at on every UPDATE.
-- tg_set_updated_at() is defined in V001__initial_schema.sql.
CREATE TRIGGER trg_projects_set_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION tg_set_updated_at();
