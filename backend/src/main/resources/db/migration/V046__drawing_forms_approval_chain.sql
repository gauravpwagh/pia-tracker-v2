-- V046: Replace the flat approved_date field (V045) with a per-authority
-- approval_chain object on every drawing form.
--
-- Each authority in the chain gets its own date property keyed by designation
-- code, matching the order in default_approver_designations.
-- The ui_schema wires the object to the custom ApprovalChainField widget.

-- ── 1. Undo V045 flat field: remove approved_date from all drawing schemas ────
UPDATE form_definitions
SET schema_json = schema_json #- '{properties,approved_date}'
WHERE activity_type_code = 'DRAWING_APPROVAL';

-- ── 2. Remove approved_date from all ui:order arrays ─────────────────────────
UPDATE form_definitions
SET ui_schema_json = jsonb_set(
    ui_schema_json,
    '{ui:order}',
    (SELECT jsonb_agg(elem ORDER BY ordinality)
     FROM jsonb_array_elements(ui_schema_json -> 'ui:order') WITH ORDINALITY AS t(elem, ordinality)
     WHERE elem::text <> '"approved_date"')
)
WHERE activity_type_code = 'DRAWING_APPROVAL';

-- ── 3. Remove ui:description banner added by V045 ────────────────────────────
UPDATE form_definitions
SET ui_schema_json = ui_schema_json - 'ui:description'
WHERE activity_type_code = 'DRAWING_APPROVAL';

-- ── 4. Per-form: add approval_chain to schema + ui_schema ────────────────────
-- Pattern per form:
--   a) Add approval_chain object property to schema_json
--   b) Append approval_chain to ui:order
--   c) Add approval_chain ui:field = approvalChain in ui_schema_json

-- 1. ESP  — Sr DEN → Dy CEE
UPDATE form_definitions
SET
    schema_json = jsonb_set(schema_json, '{properties,approval_chain}',
        '{"type":"object","title":"Approving Authority","additionalProperties":false,"properties":{"SR_DEN":{"type":"string","format":"date","title":"Sr DEN"},"DY_CEE":{"type":"string","format":"date","title":"Dy CEE"}}}'::jsonb, true),
    ui_schema_json = jsonb_set(
        jsonb_set(ui_schema_json, '{ui:order}', (ui_schema_json -> 'ui:order') || '["approval_chain"]'::jsonb),
        '{approval_chain}', '{"ui:field":"approvalChain"}'::jsonb, true)
WHERE code = 'ESP_DRAWING_V1';

-- 2. SIP  — Sr DEN → Dy CE → CE/Planning
UPDATE form_definitions
SET
    schema_json = jsonb_set(schema_json, '{properties,approval_chain}',
        '{"type":"object","title":"Approving Authority","additionalProperties":false,"properties":{"SR_DEN":{"type":"string","format":"date","title":"Sr DEN"},"DY_CE":{"type":"string","format":"date","title":"Dy CE"},"CE_PLANNING":{"type":"string","format":"date","title":"CE/Planning"}}}'::jsonb, true),
    ui_schema_json = jsonb_set(
        jsonb_set(ui_schema_json, '{ui:order}', (ui_schema_json -> 'ui:order') || '["approval_chain"]'::jsonb),
        '{approval_chain}', '{"ui:field":"approvalChain"}'::jsonb, true)
WHERE code = 'SIP_DRAWING_V1';

-- 3. ST_LT_TOC  — Sr DEN → Dy CE/Track → CTE
UPDATE form_definitions
SET
    schema_json = jsonb_set(schema_json, '{properties,approval_chain}',
        '{"type":"object","title":"Approving Authority","additionalProperties":false,"properties":{"SR_DEN":{"type":"string","format":"date","title":"Sr DEN"},"DY_CE_TRACK":{"type":"string","format":"date","title":"Dy CE/Track"},"CTE":{"type":"string","format":"date","title":"CTE"}}}'::jsonb, true),
    ui_schema_json = jsonb_set(
        jsonb_set(ui_schema_json, '{ui:order}', (ui_schema_json -> 'ui:order') || '["approval_chain"]'::jsonb),
        '{approval_chain}', '{"ui:field":"approvalChain"}'::jsonb, true)
WHERE code = 'ST_LT_TOC_DRAWING_V1';

-- 4. SWR  — Sr DOM → ADRM → DRM
UPDATE form_definitions
SET
    schema_json = jsonb_set(schema_json, '{properties,approval_chain}',
        '{"type":"object","title":"Approving Authority","additionalProperties":false,"properties":{"SR_DOM":{"type":"string","format":"date","title":"Sr DOM"},"ADRM":{"type":"string","format":"date","title":"ADRM"},"DRM":{"type":"string","format":"date","title":"DRM"}}}'::jsonb, true),
    ui_schema_json = jsonb_set(
        jsonb_set(ui_schema_json, '{ui:order}', (ui_schema_json -> 'ui:order') || '["approval_chain"]'::jsonb),
        '{approval_chain}', '{"ui:field":"approvalChain"}'::jsonb, true)
WHERE code = 'SWR_DRAWING_V1';

-- 5. SWRD  — Sr DEN → Sr DOM → ADRM
UPDATE form_definitions
SET
    schema_json = jsonb_set(schema_json, '{properties,approval_chain}',
        '{"type":"object","title":"Approving Authority","additionalProperties":false,"properties":{"SR_DEN":{"type":"string","format":"date","title":"Sr DEN"},"SR_DOM":{"type":"string","format":"date","title":"Sr DOM"},"ADRM":{"type":"string","format":"date","title":"ADRM"}}}'::jsonb, true),
    ui_schema_json = jsonb_set(
        jsonb_set(ui_schema_json, '{ui:order}', (ui_schema_json -> 'ui:order') || '["approval_chain"]'::jsonb),
        '{approval_chain}', '{"ui:field":"approvalChain"}'::jsonb, true)
WHERE code = 'SWRD_DRAWING_V1';

-- 6. FAT  — Sr DEN → Dy CE/Track → CTE
UPDATE form_definitions
SET
    schema_json = jsonb_set(schema_json, '{properties,approval_chain}',
        '{"type":"object","title":"Approving Authority","additionalProperties":false,"properties":{"SR_DEN":{"type":"string","format":"date","title":"Sr DEN"},"DY_CE_TRACK":{"type":"string","format":"date","title":"Dy CE/Track"},"CTE":{"type":"string","format":"date","title":"CTE"}}}'::jsonb, true),
    ui_schema_json = jsonb_set(
        jsonb_set(ui_schema_json, '{ui:order}', (ui_schema_json -> 'ui:order') || '["approval_chain"]'::jsonb),
        '{approval_chain}', '{"ui:field":"approvalChain"}'::jsonb, true)
WHERE code = 'FAT_DRAWING_V1';

-- 7. SAT  — Sr DEN → Dy CE/Track
UPDATE form_definitions
SET
    schema_json = jsonb_set(schema_json, '{properties,approval_chain}',
        '{"type":"object","title":"Approving Authority","additionalProperties":false,"properties":{"SR_DEN":{"type":"string","format":"date","title":"Sr DEN"},"DY_CE_TRACK":{"type":"string","format":"date","title":"Dy CE/Track"}}}'::jsonb, true),
    ui_schema_json = jsonb_set(
        jsonb_set(ui_schema_json, '{ui:order}', (ui_schema_json -> 'ui:order') || '["approval_chain"]'::jsonb),
        '{approval_chain}', '{"ui:field":"approvalChain"}'::jsonb, true)
WHERE code = 'SAT_DRAWING_V1';

-- 8. RSP  — Sr DSTE → Dy CSTE → CSTE/Con
UPDATE form_definitions
SET
    schema_json = jsonb_set(schema_json, '{properties,approval_chain}',
        '{"type":"object","title":"Approving Authority","additionalProperties":false,"properties":{"SR_DSTE":{"type":"string","format":"date","title":"Sr DSTE"},"DY_CSTE":{"type":"string","format":"date","title":"Dy CSTE"},"CSTE_CON":{"type":"string","format":"date","title":"CSTE/Con"}}}'::jsonb, true),
    ui_schema_json = jsonb_set(
        jsonb_set(ui_schema_json, '{ui:order}', (ui_schema_json -> 'ui:order') || '["approval_chain"]'::jsonb),
        '{approval_chain}', '{"ui:field":"approvalChain"}'::jsonb, true)
WHERE code = 'RSP_DRAWING_V1';

-- 9. CABLE_ROUTE_PLAN  — Sr DEE/TRD → Dy CEE → CEE/Con
UPDATE form_definitions
SET
    schema_json = jsonb_set(schema_json, '{properties,approval_chain}',
        '{"type":"object","title":"Approving Authority","additionalProperties":false,"properties":{"SR_DEE_TRD":{"type":"string","format":"date","title":"Sr DEE/TRD"},"DY_CEE":{"type":"string","format":"date","title":"Dy CEE"},"CEE_CON":{"type":"string","format":"date","title":"CEE/Con"}}}'::jsonb, true),
    ui_schema_json = jsonb_set(
        jsonb_set(ui_schema_json, '{ui:order}', (ui_schema_json -> 'ui:order') || '["approval_chain"]'::jsonb),
        '{approval_chain}', '{"ui:field":"approvalChain"}'::jsonb, true)
WHERE code = 'CABLE_ROUTE_PLAN_DRAWING_V1';

-- 10. LOP  — Sr DEN → Sr DOM → ADRM
UPDATE form_definitions
SET
    schema_json = jsonb_set(schema_json, '{properties,approval_chain}',
        '{"type":"object","title":"Approving Authority","additionalProperties":false,"properties":{"SR_DEN":{"type":"string","format":"date","title":"Sr DEN"},"SR_DOM":{"type":"string","format":"date","title":"Sr DOM"},"ADRM":{"type":"string","format":"date","title":"ADRM"}}}'::jsonb, true),
    ui_schema_json = jsonb_set(
        jsonb_set(ui_schema_json, '{ui:order}', (ui_schema_json -> 'ui:order') || '["approval_chain"]'::jsonb),
        '{approval_chain}', '{"ui:field":"approvalChain"}'::jsonb, true)
WHERE code = 'LOP_DRAWING_V1';

-- 11. PROJECT_SHEET  — Sr DEN → Dy CE → CE/Planning
UPDATE form_definitions
SET
    schema_json = jsonb_set(schema_json, '{properties,approval_chain}',
        '{"type":"object","title":"Approving Authority","additionalProperties":false,"properties":{"SR_DEN":{"type":"string","format":"date","title":"Sr DEN"},"DY_CE":{"type":"string","format":"date","title":"Dy CE"},"CE_PLANNING":{"type":"string","format":"date","title":"CE/Planning"}}}'::jsonb, true),
    ui_schema_json = jsonb_set(
        jsonb_set(ui_schema_json, '{ui:order}', (ui_schema_json -> 'ui:order') || '["approval_chain"]'::jsonb),
        '{approval_chain}', '{"ui:field":"approvalChain"}'::jsonb, true)
WHERE code = 'PROJECT_SHEET_DRAWING_V1';

-- 12. GAD_MEGA  — CBE → Dy CE/Bridge → PCE
UPDATE form_definitions
SET
    schema_json = jsonb_set(schema_json, '{properties,approval_chain}',
        '{"type":"object","title":"Approving Authority","additionalProperties":false,"properties":{"CBE":{"type":"string","format":"date","title":"CBE"},"DY_CE_BRIDGE":{"type":"string","format":"date","title":"Dy CE/Bridge"},"PCE":{"type":"string","format":"date","title":"PCE"}}}'::jsonb, true),
    ui_schema_json = jsonb_set(
        jsonb_set(ui_schema_json, '{ui:order}', (ui_schema_json -> 'ui:order') || '["approval_chain"]'::jsonb),
        '{approval_chain}', '{"ui:field":"approvalChain"}'::jsonb, true)
WHERE code = 'GAD_MEGA_DRAWING_V1';

-- 13. GAD_MAJOR  — CBE → Dy CE/Bridge → Sr DEN
UPDATE form_definitions
SET
    schema_json = jsonb_set(schema_json, '{properties,approval_chain}',
        '{"type":"object","title":"Approving Authority","additionalProperties":false,"properties":{"CBE":{"type":"string","format":"date","title":"CBE"},"DY_CE_BRIDGE":{"type":"string","format":"date","title":"Dy CE/Bridge"},"SR_DEN":{"type":"string","format":"date","title":"Sr DEN"}}}'::jsonb, true),
    ui_schema_json = jsonb_set(
        jsonb_set(ui_schema_json, '{ui:order}', (ui_schema_json -> 'ui:order') || '["approval_chain"]'::jsonb),
        '{approval_chain}', '{"ui:field":"approvalChain"}'::jsonb, true)
WHERE code = 'GAD_MAJOR_DRAWING_V1';

-- 14. GAD_MINOR  — Dy CE/Bridge → Sr DEN
UPDATE form_definitions
SET
    schema_json = jsonb_set(schema_json, '{properties,approval_chain}',
        '{"type":"object","title":"Approving Authority","additionalProperties":false,"properties":{"DY_CE_BRIDGE":{"type":"string","format":"date","title":"Dy CE/Bridge"},"SR_DEN":{"type":"string","format":"date","title":"Sr DEN"}}}'::jsonb, true),
    ui_schema_json = jsonb_set(
        jsonb_set(ui_schema_json, '{ui:order}', (ui_schema_json -> 'ui:order') || '["approval_chain"]'::jsonb),
        '{approval_chain}', '{"ui:field":"approvalChain"}'::jsonb, true)
WHERE code = 'GAD_MINOR_DRAWING_V1';

-- 15. LWR_PLAN  — Sr DEN → Dy CE/Track → CTE
UPDATE form_definitions
SET
    schema_json = jsonb_set(schema_json, '{properties,approval_chain}',
        '{"type":"object","title":"Approving Authority","additionalProperties":false,"properties":{"SR_DEN":{"type":"string","format":"date","title":"Sr DEN"},"DY_CE_TRACK":{"type":"string","format":"date","title":"Dy CE/Track"},"CTE":{"type":"string","format":"date","title":"CTE"}}}'::jsonb, true),
    ui_schema_json = jsonb_set(
        jsonb_set(ui_schema_json, '{ui:order}', (ui_schema_json -> 'ui:order') || '["approval_chain"]'::jsonb),
        '{approval_chain}', '{"ui:field":"approvalChain"}'::jsonb, true)
WHERE code = 'LWR_PLAN_DRAWING_V1';

-- 16. CURVE_DETAILS  — Sr DEN → Dy CE/Track
UPDATE form_definitions
SET
    schema_json = jsonb_set(schema_json, '{properties,approval_chain}',
        '{"type":"object","title":"Approving Authority","additionalProperties":false,"properties":{"SR_DEN":{"type":"string","format":"date","title":"Sr DEN"},"DY_CE_TRACK":{"type":"string","format":"date","title":"Dy CE/Track"}}}'::jsonb, true),
    ui_schema_json = jsonb_set(
        jsonb_set(ui_schema_json, '{ui:order}', (ui_schema_json -> 'ui:order') || '["approval_chain"]'::jsonb),
        '{approval_chain}', '{"ui:field":"approvalChain"}'::jsonb, true)
WHERE code = 'CURVE_DETAILS_DRAWING_V1';

-- 17. GRADE_CONDONATION  — Sr DEN → Dy CE → CE/Planning
UPDATE form_definitions
SET
    schema_json = jsonb_set(schema_json, '{properties,approval_chain}',
        '{"type":"object","title":"Approving Authority","additionalProperties":false,"properties":{"SR_DEN":{"type":"string","format":"date","title":"Sr DEN"},"DY_CE":{"type":"string","format":"date","title":"Dy CE"},"CE_PLANNING":{"type":"string","format":"date","title":"CE/Planning"}}}'::jsonb, true),
    ui_schema_json = jsonb_set(
        jsonb_set(ui_schema_json, '{ui:order}', (ui_schema_json -> 'ui:order') || '["approval_chain"]'::jsonb),
        '{approval_chain}', '{"ui:field":"approvalChain"}'::jsonb, true)
WHERE code = 'GRADE_CONDONATION_DRAWING_V1';

-- 18. BRIDGE_MINOR_SANCTION  — Dy CE/Bridge → Sr DEN
UPDATE form_definitions
SET
    schema_json = jsonb_set(schema_json, '{properties,approval_chain}',
        '{"type":"object","title":"Approving Authority","additionalProperties":false,"properties":{"DY_CE_BRIDGE":{"type":"string","format":"date","title":"Dy CE/Bridge"},"SR_DEN":{"type":"string","format":"date","title":"Sr DEN"}}}'::jsonb, true),
    ui_schema_json = jsonb_set(
        jsonb_set(ui_schema_json, '{ui:order}', (ui_schema_json -> 'ui:order') || '["approval_chain"]'::jsonb),
        '{approval_chain}', '{"ui:field":"approvalChain"}'::jsonb, true)
WHERE code = 'BRIDGE_MINOR_SANCTION_DRAWING_V1';

-- 19. YARD_DISPENSATION  — Sr DEN → Dy CE → Sr DOM → ADRM
UPDATE form_definitions
SET
    schema_json = jsonb_set(schema_json, '{properties,approval_chain}',
        '{"type":"object","title":"Approving Authority","additionalProperties":false,"properties":{"SR_DEN":{"type":"string","format":"date","title":"Sr DEN"},"DY_CE":{"type":"string","format":"date","title":"Dy CE"},"SR_DOM":{"type":"string","format":"date","title":"Sr DOM"},"ADRM":{"type":"string","format":"date","title":"ADRM"}}}'::jsonb, true),
    ui_schema_json = jsonb_set(
        jsonb_set(ui_schema_json, '{ui:order}', (ui_schema_json -> 'ui:order') || '["approval_chain"]'::jsonb),
        '{approval_chain}', '{"ui:field":"approvalChain"}'::jsonb, true)
WHERE code = 'YARD_DISPENSATION_DRAWING_V1';

-- 20. YARD_MINOR_SANCTION  — Sr DEN → ADRM
UPDATE form_definitions
SET
    schema_json = jsonb_set(schema_json, '{properties,approval_chain}',
        '{"type":"object","title":"Approving Authority","additionalProperties":false,"properties":{"SR_DEN":{"type":"string","format":"date","title":"Sr DEN"},"ADRM":{"type":"string","format":"date","title":"ADRM"}}}'::jsonb, true),
    ui_schema_json = jsonb_set(
        jsonb_set(ui_schema_json, '{ui:order}', (ui_schema_json -> 'ui:order') || '["approval_chain"]'::jsonb),
        '{approval_chain}', '{"ui:field":"approvalChain"}'::jsonb, true)
WHERE code = 'YARD_MINOR_SANCTION_DRAWING_V1';

-- 21. STATION_BUILDING_GAD  — Dy CE/Bridge → Sr DEN → CE/Planning
UPDATE form_definitions
SET
    schema_json = jsonb_set(schema_json, '{properties,approval_chain}',
        '{"type":"object","title":"Approving Authority","additionalProperties":false,"properties":{"DY_CE_BRIDGE":{"type":"string","format":"date","title":"Dy CE/Bridge"},"SR_DEN":{"type":"string","format":"date","title":"Sr DEN"},"CE_PLANNING":{"type":"string","format":"date","title":"CE/Planning"}}}'::jsonb, true),
    ui_schema_json = jsonb_set(
        jsonb_set(ui_schema_json, '{ui:order}', (ui_schema_json -> 'ui:order') || '["approval_chain"]'::jsonb),
        '{approval_chain}', '{"ui:field":"approvalChain"}'::jsonb, true)
WHERE code = 'STATION_BUILDING_GAD_DRAWING_V1';

-- 22. FOB_GAD_TAD  — Dy CE/Bridge → CBE → Sr DEN
UPDATE form_definitions
SET
    schema_json = jsonb_set(schema_json, '{properties,approval_chain}',
        '{"type":"object","title":"Approving Authority","additionalProperties":false,"properties":{"DY_CE_BRIDGE":{"type":"string","format":"date","title":"Dy CE/Bridge"},"CBE":{"type":"string","format":"date","title":"CBE"},"SR_DEN":{"type":"string","format":"date","title":"Sr DEN"}}}'::jsonb, true),
    ui_schema_json = jsonb_set(
        jsonb_set(ui_schema_json, '{ui:order}', (ui_schema_json -> 'ui:order') || '["approval_chain"]'::jsonb),
        '{approval_chain}', '{"ui:field":"approvalChain"}'::jsonb, true)
WHERE code = 'FOB_GAD_TAD_DRAWING_V1';

-- 23. TUNNEL_DESIGN  — Dy CE/Design → Sr DEN → CE/Planning → PCE
UPDATE form_definitions
SET
    schema_json = jsonb_set(schema_json, '{properties,approval_chain}',
        '{"type":"object","title":"Approving Authority","additionalProperties":false,"properties":{"DY_CE_DESIGN":{"type":"string","format":"date","title":"Dy CE/Design"},"SR_DEN":{"type":"string","format":"date","title":"Sr DEN"},"CE_PLANNING":{"type":"string","format":"date","title":"CE/Planning"},"PCE":{"type":"string","format":"date","title":"PCE"}}}'::jsonb, true),
    ui_schema_json = jsonb_set(
        jsonb_set(ui_schema_json, '{ui:order}', (ui_schema_json -> 'ui:order') || '["approval_chain"]'::jsonb),
        '{approval_chain}', '{"ui:field":"approvalChain"}'::jsonb, true)
WHERE code = 'TUNNEL_DESIGN_DRAWING_V1';
