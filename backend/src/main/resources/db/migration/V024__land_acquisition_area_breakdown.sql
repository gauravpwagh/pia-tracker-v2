-- Add the three area-breakdown columns that forms.md specifies as top-level
-- fields on every Land Acquisition record.  The total area column already
-- exists; these capture how it splits across land category.

ALTER TABLE land_acquisition_details
    ADD COLUMN area_hectares_private NUMERIC(10,4),
    ADD COLUMN area_hectares_govt    NUMERIC(10,4),
    ADD COLUMN area_hectares_forest  NUMERIC(10,4);
