-- V041: Add total_count and total_track_length_km scope columns to
-- utility_shifting_details so activity scope metadata is persisted.

ALTER TABLE utility_shifting_details
  ADD COLUMN IF NOT EXISTS total_count            INTEGER,
  ADD COLUMN IF NOT EXISTS total_track_length_km  NUMERIC(10, 3);
