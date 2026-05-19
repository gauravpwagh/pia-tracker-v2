-- V010__attachments.sql
-- Phase 1.14: Attachment metadata table.
--
-- Design notes:
--   - Binary content is stored in MinIO (pia-attachments bucket); this table
--     is metadata only.  object_key is the MinIO object key.
--   - entity_type + entity_id: polymorphic; same pattern as comments.
--   - scan_status: PENDING → CLEAN | INFECTED.  Upload is blocked until CLEAN.
--     ClamAV scans synchronously in AttachmentService before the row is committed.
--   - Soft delete: is_deleted + deleted_at + deleted_by_user_id.
--   - content_type restricted to allowed list at the service layer (not a DB constraint
--     to allow future content types without migration).
--   - file_size_bytes stored for display and quota enforcement.

create table attachments (
    id                      uuid primary key default gen_random_uuid(),
    entity_type             varchar(32) not null,       -- ACTIVITY_RECORD | PROJECT | ACTIVITY
    entity_id               uuid not null,
    uploaded_by_user_id     uuid not null references users(id),
    original_filename       varchar(512) not null,
    content_type            varchar(128) not null,
    file_size_bytes         bigint not null,
    object_key              varchar(1024) not null,     -- MinIO object key in pia-attachments bucket
    scan_status             varchar(16) not null default 'CLEAN', -- CLEAN | INFECTED | PENDING
    created_at              timestamptz not null default now(),
    is_deleted              boolean not null default false,
    deleted_at              timestamptz,
    deleted_by_user_id      uuid references users(id)
);

create index ix_attachments_entity on attachments(entity_type, entity_id, created_at desc)
    where not is_deleted;
create index ix_attachments_uploader on attachments(uploaded_by_user_id, created_at desc)
    where not is_deleted;
