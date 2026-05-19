-- V008__comments.sql
-- Phase 1.13: comments table for user-authored notes on records/projects/activities.
--
-- Design notes:
--   - Polymorphic entity reference (entity_type + entity_id) so the same table
--     serves records, activities, and future entity types without separate tables.
--   - Two-level threading only: top-level comments + replies (parent_comment_id).
--     No deeper nesting — enforced at the service layer, not a DB constraint.
--   - mentioned_user_ids stores the UUIDs of @-mentioned users for notification fan-out.
--   - workflow_state_at_comment snapshots the entity's workflow state at post time
--     for timeline context (the History tab needs to interleave comments and transitions).
--   - Soft delete: is_deleted + deleted_at + deleted_by_user_id.
--   - updated_at maintained by the existing tg_set_updated_at() function.

create table comments (
    id                          uuid primary key default gen_random_uuid(),
    entity_type                 varchar(32) not null,    -- 'ACTIVITY_RECORD' | 'PROJECT' | 'ACTIVITY'
    entity_id                   uuid not null,
    parent_comment_id           uuid references comments(id),
    author_user_id              uuid not null references users(id),
    body_markdown               text not null check (length(trim(body_markdown)) > 0),
    mentioned_user_ids          jsonb not null default '[]',
    workflow_state_at_comment   varchar(64),
    version                     integer not null default 0,
    created_at                  timestamptz not null default now(),
    updated_at                  timestamptz not null default now(),
    is_deleted                  boolean not null default false,
    deleted_at                  timestamptz,
    deleted_by_user_id          uuid references users(id)
);

create index ix_comments_entity on comments(entity_type, entity_id, created_at desc) where not is_deleted;
create index ix_comments_parent on comments(parent_comment_id) where not is_deleted;

create trigger comments_updated_at
    before update on comments
    for each row execute function tg_set_updated_at();
