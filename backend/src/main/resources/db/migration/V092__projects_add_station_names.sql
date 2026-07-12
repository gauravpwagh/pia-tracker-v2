-- V092: Add station_names (free-text) to projects, for the Overview "Edit Details"
-- panel (#8). Editable by CE/C and Dy CE/C via PROJECT.UPDATE.OWN (see V092_001).

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS station_names TEXT;
