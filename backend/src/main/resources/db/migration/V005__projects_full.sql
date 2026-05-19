-- PIA Tracker — V005: Expand projects table and add project_assignments.
--
-- V002 created a minimal projects stub (id, zone_id, name, is_deleted, version,
-- created_at, updated_at).  This migration adds the remaining business columns
-- needed for Phase 1.7 (project lifecycle, CAO/C allocation, CE/C assignment).
--
-- project_code is nullable so existing test-seeded rows (with no code) survive.
-- lifecycle_state defaults to 'DRAFT'.

-- ─────────────────────────────────────────────────────────────────────────────
-- Expand projects
-- ─────────────────────────────────────────────────────────────────────────────

alter table projects
    add column project_code             varchar(64),
    add column project_type             varchar(64),
    add column division_id              uuid references divisions(id),
    add column chainage_from_km         numeric(10, 3),
    add column chainage_to_km           numeric(10, 3),
    add column length_km                numeric(10, 3),
    add column recommended_by_board_on  date,
    add column target_completion_year   integer,
    add column lifecycle_state          varchar(32) not null default 'DRAFT',
    add column metadata_json            jsonb not null default '{}'::jsonb,
    add column created_by_user_id       uuid references users(id),
    add column updated_by_user_id       uuid references users(id),
    add column deleted_at               timestamptz,
    add column deleted_by_user_id       uuid references users(id);

-- project_code is unique when non-null (partial unique index)
create unique index uq_projects_code on projects(project_code) where project_code is not null;

-- Additional indexes per database.md § 4
create index ix_projects_zone_state    on projects(zone_id, lifecycle_state) where not is_deleted;
create index ix_projects_division_state on projects(division_id, lifecycle_state) where not is_deleted;
create index ix_projects_lifecycle     on projects(lifecycle_state) where not is_deleted;
create index gin_projects_metadata     on projects using gin (metadata_json);

-- ─────────────────────────────────────────────────────────────────────────────
-- project_assignments
-- ─────────────────────────────────────────────────────────────────────────────

create table project_assignments (
    id                  uuid primary key default gen_random_uuid(),
    project_id          uuid not null references projects(id),
    user_id             uuid not null references users(id),
    assignment_role     varchar(32) not null,        -- CAO_C / CE_C / DY_CE_C / NODAL_DY_CE_C
    assigned_by_user_id uuid not null references users(id),
    assigned_at         timestamptz not null default now(),
    is_active           boolean not null default true,
    deactivated_at      timestamptz,
    constraint uq_pa_project_user_role unique (project_id, user_id, assignment_role)
);

create index ix_pa_project_role on project_assignments(project_id, assignment_role) where is_active;
create index ix_pa_user         on project_assignments(user_id) where is_active;
