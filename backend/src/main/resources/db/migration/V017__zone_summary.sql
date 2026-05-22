-- V017__zone_summary.sql
-- Phase 2.8: Zone-scope dashboard summary tables.
--
-- project_summary: one row per project — cross-activity roll-up.
--   Updated by SummaryUpdater in response to ProjectSummaryChangedEvent,
--   which is published after every project_activity_summary write.
--
-- zone_summary: one row per zone — roll-up from project summaries.
--   Updated by SummaryUpdater in response to ZoneSummaryChangedEvent,
--   which is published after every project_summary write.
--
-- Both are maintained in the same DB transaction as the originating write.
-- Dashboard reads from these tables, never from raw records (architecture § 4.3).

-- ─────────────────────────────────────────────────────────────────────────────
-- project_summary
-- ─────────────────────────────────────────────────────────────────────────────

create table project_summary (
    id                    uuid primary key default gen_random_uuid(),
    project_id            uuid not null unique references projects(id),
    total_records         integer not null default 0,
    authenticated_count   integer not null default 0,
    drawings_in_approval  integer not null default 0,
    sla_breach_count      integer not null default 0,
    updated_at            timestamptz not null default now()
);

create trigger project_summary_updated_at
    before update on project_summary
    for each row execute function tg_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- zone_summary
-- ─────────────────────────────────────────────────────────────────────────────

create table zone_summary (
    id                          uuid primary key default gen_random_uuid(),
    zone_id                     uuid not null unique references zones(id),
    projects_active             integer not null default 0,
    projects_with_sla_breaches  integer not null default 0,
    total_drawings_in_approval  integer not null default 0,
    updated_at                  timestamptz not null default now()
);

create trigger zone_summary_updated_at
    before update on zone_summary
    for each row execute function tg_set_updated_at();
