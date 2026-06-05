-- V035: Add optional display name to activity_records.
--
-- Existing rows remain valid (name IS NULL) and display with fallback logic:
--   name ?? recordSubtype ?? "Record {n}"
-- New records created through the UI carry a user-supplied name.

ALTER TABLE activity_records
    ADD COLUMN IF NOT EXISTS name TEXT;
