-- V115: Land Acquisition — add "Arbitration" as a new section (its own tab +
-- independent workflow instance), following the same custom-panel-section
-- pattern as Drawing Approval's "observations"/"approvals" (no schema_json
-- entry — the section bypasses RJSF entirely and is rendered by a dedicated
-- ArbitrationHearingsPanel component). Hearing data is a repeatable array
-- stored at data_json.arbitration_hearings (analogous to DA's
-- data_json.observations), one entry per hearing; a case not finalized on its
-- first hearing is handled by simply adding another hearing entry with the
-- next hearing date, same "Add" pattern as observations.

UPDATE form_definitions
SET section_codes = section_codes || 'arbitration'
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

UPDATE form_definitions
SET ui_schema_json = jsonb_set(
    ui_schema_json,
    '{ui:order}',
    (ui_schema_json -> 'ui:order') || '["arbitration"]'::jsonb
)
WHERE id = 'ffffffff-0001-0001-0001-000000000001';

-- Backfill a workflow_instances row (initial state) for every existing LA
-- record, mirroring V102's approach: use the always-present 'mutation'
-- instance on each record to source workflow_definition_id and entity_id.
INSERT INTO workflow_instances (workflow_definition_id, entity_type, entity_id, section_code, current_state_id)
SELECT wi.workflow_definition_id, wi.entity_type, wi.entity_id, 'arbitration',
       (SELECT id FROM workflow_states WHERE workflow_definition_id = wi.workflow_definition_id AND is_initial = true LIMIT 1)
FROM workflow_instances wi
WHERE wi.entity_type = 'ACTIVITY_RECORD'
  AND wi.section_code = 'mutation'
  AND wi.entity_id IN (SELECT id FROM activity_records WHERE form_definition_id = 'ffffffff-0001-0001-0001-000000000001');
