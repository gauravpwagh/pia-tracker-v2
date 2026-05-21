-- V013__forest_stage_summary.sql
-- Phase 2.4: per-stage summary table for Forest Clearance records.
--
-- Tracks how many Forest Clearance workflow instances (one per stage per record)
-- are in each state, broken down by stage code (stage_i, stage_ii, post_approval).
--
-- Maintained by SummaryUpdater on every SECTION_STANDARD_V1 workflow transition
-- for FOREST_CLEARANCE activity records.  Keyed by (project_id, stage_code).

create table project_forest_stage_summary (
    id                  uuid        primary key default gen_random_uuid(),
    project_id          uuid        not null references projects(id),
    stage_code          varchar(64) not null,
    total_records       integer     not null default 0,
    draft_count         integer     not null default 0,
    submitted_count     integer     not null default 0,
    verified_count      integer     not null default 0,
    authenticated_count integer     not null default 0,
    sent_back_count     integer     not null default 0,
    updated_at          timestamptz not null default now(),

    unique (project_id, stage_code)
);

create trigger project_forest_stage_summary_updated_at
    before update on project_forest_stage_summary
    for each row execute function tg_set_updated_at();
