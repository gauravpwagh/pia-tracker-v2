-- V040: Add affected_track_length_km to UTILITY_SHIFTING_V1 record schema.
-- This field captures the track length (km) impacted by each utility item,
-- used as the progress counter against total_track_length_km on the activity.

UPDATE form_definitions
SET
  schema_json = schema_json || jsonb_build_object(
    'properties', (schema_json -> 'properties') || jsonb_build_object(
      'affected_track_length_km', jsonb_build_object(
        'type',    'number',
        'title',   'Affected Track Length (km)',
        'minimum', 0
      )
    )
  ),
  ui_schema_json = jsonb_set(
    ui_schema_json,
    '{ui:order}',
    (
      SELECT jsonb_agg(elem)
      FROM (
        SELECT elem FROM jsonb_array_elements(ui_schema_json -> 'ui:order') AS elem
        UNION ALL
        SELECT to_jsonb('affected_track_length_km'::text)
        WHERE NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(ui_schema_json -> 'ui:order') AS e
          WHERE e = to_jsonb('affected_track_length_km'::text)
        )
      ) sub
    )
  ) || jsonb_build_object(
    'affected_track_length_km', jsonb_build_object(
      'ui:help', 'Length of railway track affected by this utility item'
    )
  )
WHERE code = 'UTILITY_SHIFTING_V1';
