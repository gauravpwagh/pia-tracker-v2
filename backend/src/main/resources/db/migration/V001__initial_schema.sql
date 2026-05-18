-- PIA Tracker — V001 Initial schema baseline
-- See docs/database.md for the full reference.
-- Once merged, this file is immutable. Subsequent changes go in new V*.sql files.

-- ─────────────────────────────────────────────────────────────────────────
-- Extensions
-- ─────────────────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";       -- gen_random_uuid()
create extension if not exists "pg_trgm";        -- full-text search support (Phase 3)

-- ─────────────────────────────────────────────────────────────────────────
-- updated_at trigger function (reused by every domain table)
-- ─────────────────────────────────────────────────────────────────────────
create or replace function tg_set_updated_at() returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

-- ─────────────────────────────────────────────────────────────────────────
-- zones
-- ─────────────────────────────────────────────────────────────────────────
create table zones (
    id              uuid primary key default gen_random_uuid(),
    code            varchar(16) not null unique,
    name            varchar(128) not null,
    short_name      varchar(32) not null,
    display_order   integer not null default 0,
    is_active       boolean not null default true,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);
create trigger zones_updated_at before update on zones
    for each row execute function tg_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- divisions
-- ─────────────────────────────────────────────────────────────────────────
create table divisions (
    id              uuid primary key default gen_random_uuid(),
    zone_id         uuid not null references zones(id),
    code            varchar(16) not null,
    name            varchar(128) not null,
    display_order   integer not null default 0,
    is_active       boolean not null default true,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    unique (zone_id, code)
);
create index ix_divisions_zone_id on divisions(zone_id);
create trigger divisions_updated_at before update on divisions
    for each row execute function tg_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- designations
-- ─────────────────────────────────────────────────────────────────────────
create table designations (
    code                  varchar(32) primary key,
    name                  varchar(128) not null,
    short_label           varchar(32) not null,
    category              varchar(32) not null,
    is_approval_role      boolean not null default false,
    is_data_entry_role    boolean not null default false,
    display_order         integer not null default 0,
    description           text,
    created_at            timestamptz not null default now(),
    constraint chk_designations_at_least_one_role check (is_approval_role or is_data_entry_role)
);

-- ─────────────────────────────────────────────────────────────────────────
-- users  (FK to created_by_user_id is self-referential; intentionally nullable for system rows)
-- ─────────────────────────────────────────────────────────────────────────
create table users (
    id                       uuid primary key default gen_random_uuid(),
    employee_id              varchar(32) unique,
    name                     varchar(256) not null,
    email                    varchar(256) not null unique,
    designation_code         varchar(32) not null references designations(code),
    primary_zone_id          uuid references zones(id),
    primary_division_id      uuid references divisions(id),
    is_active                boolean not null default true,
    is_system_user           boolean not null default false,
    last_login_at            timestamptz,
    created_at               timestamptz not null default now(),
    created_by_user_id       uuid references users(id),
    updated_at               timestamptz not null default now(),
    updated_by_user_id       uuid references users(id),
    is_deleted               boolean not null default false,
    deleted_at               timestamptz,
    deleted_by_user_id       uuid references users(id),
    version                  integer not null default 0
);
create index ix_users_designation_zone on users(designation_code, primary_zone_id)
    where is_active and not is_deleted;
create index ix_users_email on users(email);
create trigger users_updated_at before update on users
    for each row execute function tg_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- user_zone_assignments  (cross-zone access)
-- ─────────────────────────────────────────────────────────────────────────
create table user_zone_assignments (
    id                       uuid primary key default gen_random_uuid(),
    user_id                  uuid not null references users(id),
    zone_id                  uuid not null references zones(id),
    granted_by_user_id       uuid not null references users(id),
    granted_at               timestamptz not null default now(),
    expires_at               timestamptz,
    reason                   text,
    is_active                boolean not null default true,
    unique (user_id, zone_id)
);
create index ix_uza_user_id on user_zone_assignments(user_id) where is_active;

-- ─────────────────────────────────────────────────────────────────────────
-- permissions, roles, role_permissions, user_roles, user_permissions
-- ─────────────────────────────────────────────────────────────────────────
create table permissions (
    code             varchar(128) primary key,
    description      text not null,
    category         varchar(64) not null,
    is_system_grant  boolean not null default false
);

create table roles (
    code           varchar(64) primary key,
    name           varchar(128) not null,
    description    text,
    is_active      boolean not null default true,
    created_at     timestamptz not null default now()
);

create table role_permissions (
    role_code        varchar(64) not null references roles(code),
    permission_code  varchar(128) not null references permissions(code),
    primary key (role_code, permission_code)
);

create table designation_default_roles (
    designation_code  varchar(32) not null references designations(code),
    role_code         varchar(64) not null references roles(code),
    primary key (designation_code, role_code)
);

create table user_roles (
    user_id              uuid not null references users(id),
    role_code            varchar(64) not null references roles(code),
    granted_by_user_id   uuid references users(id),
    granted_at           timestamptz not null default now(),
    primary key (user_id, role_code)
);

create table user_permissions (
    user_id              uuid not null references users(id),
    permission_code      varchar(128) not null references permissions(code),
    granted_by_user_id   uuid not null references users(id),
    granted_at           timestamptz not null default now(),
    expires_at           timestamptz,
    reason               text,
    primary key (user_id, permission_code)
);

-- ─────────────────────────────────────────────────────────────────────────
-- audit_log (partitioned, append-only)
-- ─────────────────────────────────────────────────────────────────────────
create table audit_log (
    id                  uuid not null default gen_random_uuid(),
    actor_user_id       uuid,
    action              varchar(64) not null,
    entity_type         varchar(64) not null,
    entity_id           uuid,
    before_json         jsonb,
    after_json          jsonb,
    change_summary_json jsonb,
    ip_address          inet,
    user_agent          text,
    trace_id            varchar(64),
    prev_hash           varchar(64),
    row_hash            varchar(64) not null,
    at                  timestamptz not null default now(),
    primary key (id, at)
) partition by range (at);

create table audit_log_2026_05 partition of audit_log
    for values from ('2026-05-01') to ('2026-06-01');
create table audit_log_2026_06 partition of audit_log
    for values from ('2026-06-01') to ('2026-07-01');
create table audit_log_2026_07 partition of audit_log
    for values from ('2026-07-01') to ('2026-08-01');

create index ix_audit_entity_at on audit_log(entity_type, entity_id, at desc);
create index ix_audit_actor_at on audit_log(actor_user_id, at desc);
create index ix_audit_at on audit_log(at desc);

-- Append-only enforcement
create or replace function audit_log_immutable() returns trigger as $$
begin
    raise exception 'audit_log is append-only';
end;
$$ language plpgsql;
create trigger audit_log_no_update before update on audit_log
    for each row execute function audit_log_immutable();
create trigger audit_log_no_delete before delete on audit_log
    for each row execute function audit_log_immutable();

-- ─────────────────────────────────────────────────────────────────────────
-- activity_types
-- ─────────────────────────────────────────────────────────────────────────
create table activity_types (
    code           varchar(64) primary key,
    name           varchar(128) not null,
    description    text,
    display_order  integer not null default 0,
    icon_code      varchar(32),
    is_active      boolean not null default true
);

-- (form_definitions, workflow_*, projects, project_assignments, project_activities,
--  activity_records, drawing_approvers, comments, notifications, attachments,
--  and all summary tables follow in V002..V010. Splitting keeps each migration small,
--  reviewable, and aligned with one bounded context.)
