-- V003_001__seed_activity_types.sql
-- Seeds the activity types used in PIA Tracker v1.
-- These codes are referenced by form_definitions.activity_type_code.

INSERT INTO activity_types (code, name, description, display_order, is_active) VALUES
    ('LAND_ACQUISITION',      'Land Acquisition',        'Village-level land acquisition tracking (9 sections)', 1, true),
    ('UTILITY_SHIFTING',      'Utility Shifting',        'Relocation of utilities affecting the alignment',       2, true),
    ('FOREST_CLEARANCE',      'Forest Clearance',        'Three-stage forest clearance approval',                3, true),
    ('TENDER_PACKAGING',      'Tender Packaging',        'Tender preparation and NIT publication',               4, true),
    ('TEMPORARY_OFFICE_SPACE','Temporary Office Space',  'Site office setup for construction phase',             5, true),
    ('DRAWING_APPROVAL',      'Drawing Approval',        'Engineering drawing checklist and approvals',          6, true);
