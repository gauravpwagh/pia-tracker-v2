-- V120: Utility Shifting — drop the "required" list entirely (record_name,
-- utility_type, chainage_from, chainage_to, executing_agency). This clears
-- both the red-asterisk display (RJSF's antd template marks a field required
-- based on schema.required) and the backend's required-field validation on
-- save — the two must move together or the UI and save-time errors disagree.

UPDATE form_definitions
SET schema_json = jsonb_set(schema_json, '{required}', '[]'::jsonb)
WHERE code = 'UTILITY_SHIFTING_V1';
