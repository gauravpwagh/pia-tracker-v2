-- V018__pan_india_summary.sql
-- Phase 2.9: PAN India dashboard summary table.
--
-- pan_india_summary: a singleton row that aggregates zone_summary values
-- across all zones in the system.
--
-- The singleton constraint (unique(singleton) where singleton = true +
-- check(singleton)) ensures at most one row can exist.  The upsert in
-- SummaryUpdater always targets singleton = true.
--
-- Updated by SummaryUpdater every time any zone_summary row changes, in the
-- same DB transaction as the originating workflow event (architecture rule #3).

create table pan_india_summary (
    id                               uuid primary key default gen_random_uuid(),
    singleton                        boolean not null default true,
    total_projects_active            integer not null default 0,
    total_projects_with_sla_breaches integer not null default 0,
    total_drawings_in_approval       integer not null default 0,
    updated_at                       timestamptz not null default now(),
    constraint pan_india_summary_singleton_true   check (singleton),
    constraint pan_india_summary_singleton_unique unique (singleton)
);

create trigger pan_india_summary_updated_at
    before update on pan_india_summary
    for each row execute function tg_set_updated_at();
