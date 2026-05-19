-- V011__land_activity_summary.sql
-- Phase 1.14: Per-project land-acquisition activity summary for the KPI dashboard.
--
-- Design notes:
--   - One row per (project_id, activity_type_code).  For Phase 1 the only
--     activity_type_code is 'LAND_ACQUISITION'; future phases add others.
--   - Counts are maintained by SummaryUpdater (an ApplicationEventListener on
--     WorkflowStateChangedEvent) in the same transaction as the originating write.
--   - The dashboard controller reads from this table, never from raw records.
--   - updated_at is maintained by the standard tg_set_updated_at() trigger.
--   - total_records = draft + submitted + verified + authenticated + sent_back;
--     kept separately for convenience.

create table project_activity_summary (
    id                  uuid primary key default gen_random_uuid(),
    project_id          uuid not null references projects(id),
    activity_type_code  varchar(64) not null,
    total_records       integer not null default 0,
    draft_count         integer not null default 0,
    submitted_count     integer not null default 0,
    verified_count      integer not null default 0,
    authenticated_count integer not null default 0,
    sent_back_count     integer not null default 0,
    updated_at          timestamptz not null default now(),
    unique (project_id, activity_type_code)
);

create trigger project_activity_summary_updated_at
    before update on project_activity_summary
    for each row execute function tg_set_updated_at();
