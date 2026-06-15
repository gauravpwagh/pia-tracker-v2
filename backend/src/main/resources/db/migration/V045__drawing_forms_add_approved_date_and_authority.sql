-- V045: Add approved_date field and approving-authority description to all drawing forms.
--
-- 1. Add approved_date property to every DRAWING_APPROVAL form schema (one UPDATE).
-- 2. Append approved_date to every form's ui:order (one UPDATE).
-- 3. Per-form: set ui:description to the human-readable authority chain so it renders
--    as a section label above the field in the RJSF form.

-- ── 1. Schema: add approved_date property to all drawing forms ────────────────
UPDATE form_definitions
SET schema_json = jsonb_set(
    schema_json,
    '{properties,approved_date}',
    '{"type": "string", "format": "date", "title": "Approving Date"}'::jsonb,
    true
)
WHERE activity_type_code = 'DRAWING_APPROVAL';

-- ── 2. ui_schema: append approved_date to ui:order for all drawing forms ──────
UPDATE form_definitions
SET ui_schema_json = jsonb_set(
    ui_schema_json,
    '{ui:order}',
    (ui_schema_json -> 'ui:order') || '["approved_date"]'::jsonb
)
WHERE activity_type_code = 'DRAWING_APPROVAL';

-- ── 3. Per-form: set ui:description = approving authority chain ───────────────

-- 1. ESP  — Sr DEN → Dy CEE
UPDATE form_definitions
SET ui_schema_json = jsonb_set(ui_schema_json, '{ui:description}',
    to_jsonb('Approving Authority: Sr DEN → Dy CEE'::text), true)
WHERE code = 'ESP_DRAWING_V1';

-- 2. SIP  — Sr DEN → Dy CE → CE/Planning
UPDATE form_definitions
SET ui_schema_json = jsonb_set(ui_schema_json, '{ui:description}',
    to_jsonb('Approving Authority: Sr DEN → Dy CE → CE/Planning'::text), true)
WHERE code = 'SIP_DRAWING_V1';

-- 3. ST_LT_TOC  — Sr DEN → Dy CE/Track → CTE
UPDATE form_definitions
SET ui_schema_json = jsonb_set(ui_schema_json, '{ui:description}',
    to_jsonb('Approving Authority: Sr DEN → Dy CE/Track → CTE'::text), true)
WHERE code = 'ST_LT_TOC_DRAWING_V1';

-- 4. SWR  — Sr DOM → ADRM → DRM
UPDATE form_definitions
SET ui_schema_json = jsonb_set(ui_schema_json, '{ui:description}',
    to_jsonb('Approving Authority: Sr DOM → ADRM → DRM'::text), true)
WHERE code = 'SWR_DRAWING_V1';

-- 5. SWRD  — Sr DEN → Sr DOM → ADRM
UPDATE form_definitions
SET ui_schema_json = jsonb_set(ui_schema_json, '{ui:description}',
    to_jsonb('Approving Authority: Sr DEN → Sr DOM → ADRM'::text), true)
WHERE code = 'SWRD_DRAWING_V1';

-- 6. FAT  — Sr DEN → Dy CE/Track → CTE
UPDATE form_definitions
SET ui_schema_json = jsonb_set(ui_schema_json, '{ui:description}',
    to_jsonb('Approving Authority: Sr DEN → Dy CE/Track → CTE'::text), true)
WHERE code = 'FAT_DRAWING_V1';

-- 7. SAT  — Sr DEN → Dy CE/Track
UPDATE form_definitions
SET ui_schema_json = jsonb_set(ui_schema_json, '{ui:description}',
    to_jsonb('Approving Authority: Sr DEN → Dy CE/Track'::text), true)
WHERE code = 'SAT_DRAWING_V1';

-- 8. RSP  — Sr DSTE → Dy CSTE → CSTE/Con
UPDATE form_definitions
SET ui_schema_json = jsonb_set(ui_schema_json, '{ui:description}',
    to_jsonb('Approving Authority: Sr DSTE → Dy CSTE → CSTE/Con'::text), true)
WHERE code = 'RSP_DRAWING_V1';

-- 9. CABLE_ROUTE_PLAN  — Sr DEE/TRD → Dy CEE → CEE/Con
UPDATE form_definitions
SET ui_schema_json = jsonb_set(ui_schema_json, '{ui:description}',
    to_jsonb('Approving Authority: Sr DEE/TRD → Dy CEE → CEE/Con'::text), true)
WHERE code = 'CABLE_ROUTE_PLAN_DRAWING_V1';

-- 10. LOP  — Sr DEN → Sr DOM → ADRM
UPDATE form_definitions
SET ui_schema_json = jsonb_set(ui_schema_json, '{ui:description}',
    to_jsonb('Approving Authority: Sr DEN → Sr DOM → ADRM'::text), true)
WHERE code = 'LOP_DRAWING_V1';

-- 11. PROJECT_SHEET  — Sr DEN → Dy CE → CE/Planning
UPDATE form_definitions
SET ui_schema_json = jsonb_set(ui_schema_json, '{ui:description}',
    to_jsonb('Approving Authority: Sr DEN → Dy CE → CE/Planning'::text), true)
WHERE code = 'PROJECT_SHEET_DRAWING_V1';

-- 12. GAD_MEGA  — CBE → Dy CE/Bridge → PCE
UPDATE form_definitions
SET ui_schema_json = jsonb_set(ui_schema_json, '{ui:description}',
    to_jsonb('Approving Authority: CBE → Dy CE/Bridge → PCE'::text), true)
WHERE code = 'GAD_MEGA_DRAWING_V1';

-- 13. GAD_MAJOR  — CBE → Dy CE/Bridge → Sr DEN
UPDATE form_definitions
SET ui_schema_json = jsonb_set(ui_schema_json, '{ui:description}',
    to_jsonb('Approving Authority: CBE → Dy CE/Bridge → Sr DEN'::text), true)
WHERE code = 'GAD_MAJOR_DRAWING_V1';

-- 14. GAD_MINOR  — Dy CE/Bridge → Sr DEN
UPDATE form_definitions
SET ui_schema_json = jsonb_set(ui_schema_json, '{ui:description}',
    to_jsonb('Approving Authority: Dy CE/Bridge → Sr DEN'::text), true)
WHERE code = 'GAD_MINOR_DRAWING_V1';

-- 15. LWR_PLAN  — Sr DEN → Dy CE/Track → CTE
UPDATE form_definitions
SET ui_schema_json = jsonb_set(ui_schema_json, '{ui:description}',
    to_jsonb('Approving Authority: Sr DEN → Dy CE/Track → CTE'::text), true)
WHERE code = 'LWR_PLAN_DRAWING_V1';

-- 16. CURVE_DETAILS  — Sr DEN → Dy CE/Track
UPDATE form_definitions
SET ui_schema_json = jsonb_set(ui_schema_json, '{ui:description}',
    to_jsonb('Approving Authority: Sr DEN → Dy CE/Track'::text), true)
WHERE code = 'CURVE_DETAILS_DRAWING_V1';

-- 17. GRADE_CONDONATION  — Sr DEN → Dy CE → CE/Planning
UPDATE form_definitions
SET ui_schema_json = jsonb_set(ui_schema_json, '{ui:description}',
    to_jsonb('Approving Authority: Sr DEN → Dy CE → CE/Planning'::text), true)
WHERE code = 'GRADE_CONDONATION_DRAWING_V1';

-- 18. BRIDGE_MINOR_SANCTION  — Dy CE/Bridge → Sr DEN
UPDATE form_definitions
SET ui_schema_json = jsonb_set(ui_schema_json, '{ui:description}',
    to_jsonb('Approving Authority: Dy CE/Bridge → Sr DEN'::text), true)
WHERE code = 'BRIDGE_MINOR_SANCTION_DRAWING_V1';

-- 19. YARD_DISPENSATION  — Sr DEN → Dy CE → Sr DOM → ADRM
UPDATE form_definitions
SET ui_schema_json = jsonb_set(ui_schema_json, '{ui:description}',
    to_jsonb('Approving Authority: Sr DEN → Dy CE → Sr DOM → ADRM'::text), true)
WHERE code = 'YARD_DISPENSATION_DRAWING_V1';

-- 20. YARD_MINOR_SANCTION  — Sr DEN → ADRM
UPDATE form_definitions
SET ui_schema_json = jsonb_set(ui_schema_json, '{ui:description}',
    to_jsonb('Approving Authority: Sr DEN → ADRM'::text), true)
WHERE code = 'YARD_MINOR_SANCTION_DRAWING_V1';

-- 21. STATION_BUILDING_GAD  — Dy CE/Bridge → Sr DEN → CE/Planning
UPDATE form_definitions
SET ui_schema_json = jsonb_set(ui_schema_json, '{ui:description}',
    to_jsonb('Approving Authority: Dy CE/Bridge → Sr DEN → CE/Planning'::text), true)
WHERE code = 'STATION_BUILDING_GAD_DRAWING_V1';

-- 22. FOB_GAD_TAD  — Dy CE/Bridge → CBE → Sr DEN
UPDATE form_definitions
SET ui_schema_json = jsonb_set(ui_schema_json, '{ui:description}',
    to_jsonb('Approving Authority: Dy CE/Bridge → CBE → Sr DEN'::text), true)
WHERE code = 'FOB_GAD_TAD_DRAWING_V1';

-- 23. TUNNEL_DESIGN  — Dy CE/Design → Sr DEN → CE/Planning → PCE
UPDATE form_definitions
SET ui_schema_json = jsonb_set(ui_schema_json, '{ui:description}',
    to_jsonb('Approving Authority: Dy CE/Design → Sr DEN → CE/Planning → PCE'::text), true)
WHERE code = 'TUNNEL_DESIGN_DRAWING_V1';
