-- V066: Remove 'remarks' from $defs.Sanction.properties for all DA forms.
-- V065 added remarks to DrawingDetails but the jsonb_set path for removing it
-- from Sanction did not take effect due to nesting order. Fix it here.

UPDATE form_definitions
SET schema_json = jsonb_set(
  schema_json,
  '{$defs,Sanction,properties}',
  (schema_json -> '$defs' -> 'Sanction' -> 'properties') - 'remarks'
)
WHERE activity_type_code = 'DRAWING_APPROVAL';
