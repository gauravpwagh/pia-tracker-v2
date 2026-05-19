-- PIA Tracker — V004: Workflow engine tables
-- workflow_definitions was created in V003.  This migration adds the remaining
-- tables: workflow_states, workflow_transitions, workflow_instances,
-- workflow_history (monthly-partitioned), and a minimal activity_records stub
-- that Phase 1.8 will expand.

-- ─────────────────────────────────────────────────────────────────────────────
-- workflow_states
-- ─────────────────────────────────────────────────────────────────────────────
create table workflow_states (
    id                     uuid primary key default gen_random_uuid(),
    workflow_definition_id uuid not null references workflow_definitions(id),
    code                   varchar(64) not null,
    label                  varchar(128) not null,
    is_initial             boolean not null default false,
    is_terminal            boolean not null default false,
    role_required_code     varchar(64) references roles(code),
    sla_days               integer,
    sla_warning_days       integer,
    display_color          varchar(16),
    constraint uq_ws_def_code unique (workflow_definition_id, code)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- workflow_transitions
-- ─────────────────────────────────────────────────────────────────────────────
create table workflow_transitions (
    id                     uuid primary key default gen_random_uuid(),
    workflow_definition_id uuid not null references workflow_definitions(id),
    from_state_id          uuid not null references workflow_states(id),
    to_state_id            uuid not null references workflow_states(id),
    action_code            varchar(64) not null,
    action_label           varchar(128) not null,
    role_required_code     varchar(64) references roles(code),
    requires_comment       boolean not null default false,
    is_backward            boolean not null default false
);

create index ix_wt_from_action on workflow_transitions(from_state_id, action_code);

-- ─────────────────────────────────────────────────────────────────────────────
-- workflow_instances
-- ─────────────────────────────────────────────────────────────────────────────
create table workflow_instances (
    id                     uuid primary key default gen_random_uuid(),
    workflow_definition_id uuid not null references workflow_definitions(id),
    entity_type            varchar(32) not null,   -- PROJECT / ACTIVITY_RECORD
    entity_id              uuid not null,
    section_code           varchar(64),            -- null for record/project level
    current_state_id       uuid not null references workflow_states(id),
    entered_state_at       timestamptz not null default now(),
    last_actor_user_id     uuid references users(id),
    sent_back_marker       boolean not null default false,
    created_at             timestamptz not null default now()
);

create index ix_wi_entity on workflow_instances(entity_type, entity_id);
create index ix_wi_state_age on workflow_instances(current_state_id, entered_state_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- workflow_history  (partitioned monthly by at)
-- ─────────────────────────────────────────────────────────────────────────────
create table workflow_history (
    id                     uuid not null default gen_random_uuid(),
    workflow_instance_id   uuid not null references workflow_instances(id),
    from_state_id          uuid references workflow_states(id),
    to_state_id            uuid not null references workflow_states(id),
    transition_id          uuid references workflow_transitions(id),
    actor_user_id          uuid not null references users(id),
    comment                text,
    observation_json       jsonb,
    at                     timestamptz not null default now()
) partition by range (at);

-- seed two forward-looking partitions; a scheduled job creates rolling ones
create table workflow_history_2026_05 partition of workflow_history
    for values from ('2026-05-01') to ('2026-06-01');

create table workflow_history_2026_06 partition of workflow_history
    for values from ('2026-06-01') to ('2026-07-01');

create table workflow_history_2026_07 partition of workflow_history
    for values from ('2026-07-01') to ('2026-08-01');

create index ix_wh_instance on workflow_history(workflow_instance_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- activity_records  (minimal stub — Phase 1.8 adds all remaining columns)
-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 1.6 needs this table to exist so the workflow service can update the
-- cached record_state.  No FK constraints yet — those land with the full entity
-- in Phase 1.8.
create table activity_records (
    id           uuid primary key default gen_random_uuid(),
    record_state varchar(32) not null default 'DRAFT'
);
