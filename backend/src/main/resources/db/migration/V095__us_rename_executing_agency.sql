-- V095: Rename Utility Shifting's "Executing Agency" field title for clarity —
-- it specifically means the agency executing removal of the infringement.

UPDATE form_definitions
SET schema_json = jsonb_set(schema_json, '{properties,executing_agency,title}', '"Executing Agency for Removal of Infringement"'::jsonb)
WHERE code = 'UTILITY_SHIFTING_V1';
