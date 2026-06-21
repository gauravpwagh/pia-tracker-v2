-- V071: Seed acquisition_details.record_name from village_name for existing
-- LA records where it was not set by V070 (because ar.name was null).

UPDATE activity_records
SET data_json = jsonb_set(
    data_json,
    '{acquisition_details,record_name}',
    to_jsonb(data_json ->> 'village_name')
)
WHERE form_definition_id = 'ffffffff-0001-0001-0001-000000000001'
  AND (data_json -> 'acquisition_details' ->> 'record_name') IS NULL
  AND (data_json ->> 'village_name') IS NOT NULL
  AND (data_json ->> 'village_name') <> '';
