-- V033: Expand temporary_office_space_details with the full field set.
--
-- New fields:
--   details_required        — top-level Yes/No gate
--   new_agency_available    — (New Structure) agency confirmed?
--   new_tdc                 — (New Structure) Target Date of Completion
--   old_possession_given    — (Old Structure) possession given by OL?
--   old_tdc                 — (Old Structure) Target Date of Completion
--   hiring_rental_agreement — (Hiring)        rental agreement signed?
--   hiring_tdc              — (Hiring)        Target Date of Completion
--
-- The old location_name / location_chainage columns are kept (no data loss).

ALTER TABLE temporary_office_space_details
    ADD COLUMN IF NOT EXISTS details_required        BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS new_agency_available    BOOLEAN,
    ADD COLUMN IF NOT EXISTS new_tdc                 DATE,
    ADD COLUMN IF NOT EXISTS old_possession_given    BOOLEAN,
    ADD COLUMN IF NOT EXISTS old_tdc                 DATE,
    ADD COLUMN IF NOT EXISTS hiring_rental_agreement BOOLEAN,
    ADD COLUMN IF NOT EXISTS hiring_tdc              DATE;
