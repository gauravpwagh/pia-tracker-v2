-- One narrow table per activity type, keyed by activity_id (1:1 with project_activities).
-- Supersedes the metadata_json JSONB column for type-specific fields.
-- The JSONB column is kept but no longer written to for new saves.

CREATE TABLE land_acquisition_details (
    activity_id              UUID PRIMARY KEY REFERENCES project_activities(id),
    district                 TEXT,
    sub_division_taluka      TEXT,
    area_hectares_total      NUMERIC(10,4),
    villages_estimated_count INT
);

CREATE TABLE forest_clearance_details (
    activity_id           UUID PRIMARY KEY REFERENCES project_activities(id),
    forest_division_name  TEXT,
    forest_area_hectares  NUMERIC(10,4),
    project_chainage_from TEXT,
    project_chainage_to   TEXT
);

CREATE TABLE utility_shifting_details (
    activity_id      UUID PRIMARY KEY REFERENCES project_activities(id),
    utility_type     TEXT,
    owner_agency     TEXT,
    executing_agency TEXT
);

CREATE TABLE drawing_approval_details (
    activity_id    UUID PRIMARY KEY REFERENCES project_activities(id),
    drawing_type   TEXT,
    drawing_number TEXT
);

CREATE TABLE tender_packaging_details (
    activity_id     UUID PRIMARY KEY REFERENCES project_activities(id),
    package_name    TEXT,
    estimated_value NUMERIC(15,2),
    tender_type     TEXT
);

CREATE TABLE temporary_office_space_details (
    activity_id       UUID PRIMARY KEY REFERENCES project_activities(id),
    structure_type    TEXT,
    count             INT,
    location_name     TEXT,
    location_chainage TEXT
);
