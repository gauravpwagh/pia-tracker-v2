-- V009__notifications.sql
-- Phase 1.14: In-app notification store for the bell-badge endpoint.
--
-- Design notes:
--   - One row per recipient per event; fan-out happens in WorkflowNotificationListener.
--   - notification_type: coarse category for icon/colour (WORKFLOW_ACTION, MENTION, SYSTEM).
--   - entity_type + entity_id: deep-link target for the frontend.
--   - link_url: pre-computed deep link ("/records/{id}/edit") so the bell popup
--     can navigate without knowing entity semantics.
--   - Soft-delete NOT used — notifications are physically deleted after 90 days
--     by a scheduled cleanup job (Phase 3). is_read is the only state.
--   - No @Version / optimistic lock — reads are eventually consistent enough.

create table notifications (
    id                  uuid primary key default gen_random_uuid(),
    recipient_user_id   uuid not null references users(id),
    notification_type   varchar(32) not null,           -- WORKFLOW_ACTION | MENTION | SYSTEM
    title               varchar(256) not null,
    body                text not null,
    entity_type         varchar(32),                    -- e.g. ACTIVITY_RECORD
    entity_id           uuid,
    link_url            varchar(512),
    is_read             boolean not null default false,
    read_at             timestamptz,
    created_at          timestamptz not null default now()
);

create index ix_notifications_recipient on notifications(recipient_user_id, created_at desc)
    where not is_read;
create index ix_notifications_recipient_all on notifications(recipient_user_id, created_at desc);
