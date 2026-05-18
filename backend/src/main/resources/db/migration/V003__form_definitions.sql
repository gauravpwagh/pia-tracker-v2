-- V003__form_definitions.sql
-- Phase 1.5: workflow_definitions stub + form_definitions table.
--
-- workflow_definitions is a stub here — states, transitions, and instances
-- are added in V004 (Phase 1.6). The stub only exists so form_definitions
-- can carry the nullable FK without a deferred constraint.
-- form_definitions.workflow_definition_id is nullable; drawing forms and
-- test fixtures leave it null.

-- ─────────────────────────────────────────────────────────────────────────
-- workflow_definitions (stub — full schema in V004)
-- ─────────────────────────────────────────────────────────────────────────
create table workflow_definitions (
    id          uuid        primary key default gen_random_uuid(),
    code        varchar(64) not null,
    version     integer     not null,
    label       varchar(256) not null,
    applies_to  varchar(32) not null,   -- PROJECT / RECORD / SECTION
    is_active   boolean     not null default true,
    created_at  timestamptz not null default now(),
    constraint uq_workflow_def_code_version unique (code, version)
);

-- ─────────────────────────────────────────────────────────────────────────
-- form_definitions
-- ─────────────────────────────────────────────────────────────────────────
create table form_definitions (
    id                           uuid         primary key default gen_random_uuid(),
    activity_type_code           varchar(64)  not null references activity_types(code),
    code                         varchar(64)  not null,
    version                      integer      not null,
    label                        varchar(256) not null,
    schema_json                  jsonb        not null,
    ui_schema_json               jsonb        not null default '{}'::jsonb,
    workflow_definition_id       uuid         references workflow_definitions(id),
    section_codes                text[]       not null default '{}',
    default_approver_designations text[]      not null default '{}',
    is_active                    boolean      not null default true,
    created_at                   timestamptz  not null default now(),
    created_by_user_id           uuid         references users(id),
    constraint uq_form_def_code_version unique (code, version)
);

create index ix_fd_activity_active
    on form_definitions (activity_type_code, is_active);
