-- V101: Replace the single free-text "station_names" with three fields:
-- Stations From, To, and In Between (comma-separated). No existing data to
-- migrate — station_names has never been populated in practice.

ALTER TABLE projects
  DROP COLUMN IF EXISTS station_names,
  ADD COLUMN stations_from TEXT,
  ADD COLUMN stations_to TEXT,
  ADD COLUMN stations_in_between TEXT;
