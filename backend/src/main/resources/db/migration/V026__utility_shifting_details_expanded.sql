-- Expand utility_shifting_details with the full field set.
-- Fields are partitioned into:
--   1. Common     — shown for every utility type
--   2. Type-specific — shown only when utility_type matches
--   3. Agency-conditional — shown when executing_agency != RAILWAY

ALTER TABLE utility_shifting_details
    -- Common fields
    ADD COLUMN chainage_from            TEXT,
    ADD COLUMN chainage_to              TEXT,
    ADD COLUMN estimated_cost           NUMERIC(15,2),
    ADD COLUMN sanctioned_cost          NUMERIC(15,2),
    ADD COLUMN work_start_date          DATE,
    ADD COLUMN expected_completion_date DATE,
    ADD COLUMN actual_completion_date   DATE,
    ADD COLUMN current_status           TEXT,
    ADD COLUMN remarks                  TEXT,

    -- LT / HT / EHV electrical lines
    ADD COLUMN voltage_level            TEXT,
    ADD COLUMN length_km                NUMERIC(10,3),
    ADD COLUMN no_of_poles              INTEGER,

    -- Pipeline
    ADD COLUMN diameter_mm              INTEGER,
    ADD COLUMN pipeline_length_m        NUMERIC(10,1),
    ADD COLUMN fluid_type               TEXT,

    -- S&T (Signalling & Telecom)
    ADD COLUMN cable_type               TEXT,
    ADD COLUMN cable_length_km          NUMERIC(10,3),
    ADD COLUMN no_of_circuits           INTEGER,

    -- Quarter / Station Building
    ADD COLUMN no_of_units              INTEGER,
    ADD COLUMN area_sqm                 NUMERIC(10,2),

    -- TSS / SS / OHE
    ADD COLUMN capacity_mva             NUMERIC(8,2),
    ADD COLUMN no_of_bays               INTEGER,

    -- Other
    ADD COLUMN utility_description      TEXT,

    -- Executing-agency conditional (non-Railway work)
    ADD COLUMN contractor_name          TEXT,
    ADD COLUMN work_order_no            TEXT,
    ADD COLUMN work_order_date          DATE;
