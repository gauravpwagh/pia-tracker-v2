-- V012__utility_subtype_summary.sql
-- Phase 2.3: Per-project, per-utility-subtype summary for the Utility Shifting
-- activity-level dashboard.
--
-- Design notes:
--   - One row per (project_id, record_subtype).
--   - record_subtype mirrors activity_records.record_subtype
--     (OVERHEAD_LINE, WATER_PIPELINE, NALA, TELECOM_CABLE, GAS_PIPELINE, …).
--   - Maintained by SummaryUpdater inside the same workflow-transition transaction.
--   - Dashboard controller reads from this table for the utility-type breakdown view.
--   - updated_at is maintained by the standard tg_set_updated_at() trigger.
--   - total_records = draft + submitted + verified + authenticated + sent_back.

create table project_utility_subtype_summary (
    id                  uuid primary key default gen_random_uuid(),
    project_id          uuid not null references projects(id),
    record_subtype      varchar(64) not null,
    total_records       integer not null default 0,
    draft_count         integer not null default 0,
    submitted_count     integer not null default 0,
    verified_count      integer not null default 0,
    authenticated_count integer not null default 0,
    sent_back_count     integer not null default 0,
    updated_at          timestamptz not null default now(),
    unique (project_id, record_subtype)
);

create trigger project_utility_subtype_summary_updated_at
    before update on project_utility_subtype_summary
    for each row execute function tg_set_updated_at();
