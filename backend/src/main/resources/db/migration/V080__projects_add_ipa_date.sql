-- Add IPA (Investment Programme Approval) date to projects.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS ipa_date DATE;
