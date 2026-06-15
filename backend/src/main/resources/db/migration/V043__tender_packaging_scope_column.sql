-- V043: Add total_count (scope) to tender_packaging_details.

ALTER TABLE tender_packaging_details
  ADD COLUMN IF NOT EXISTS total_count INTEGER;
