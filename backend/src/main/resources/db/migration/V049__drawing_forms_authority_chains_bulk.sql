-- V049: Bulk-update approval_chain for all drawing forms per xlsx.
-- ESP (V047) and SIP (V048) already done.
-- CURVE_DETAILS and TUNNEL_DESIGN not in xlsx — left unchanged.

-- ── Group A: ST/LT/TOC, SWR, SWRD, FAT, SAT ─────────────────────────────────
-- Dy CSTE → Sr DOM → Sr DSTE → CSTE/Con → CTPM → CSTE/OL
UPDATE form_definitions
SET schema_json = jsonb_set(schema_json, '{properties,approval_chain}',
    '{"type":"object","title":"Approving Authority","additionalProperties":false,"properties":{
      "DY_CSTE":  {"type":"string","format":"date","title":"Dy CSTE"},
      "SR_DOM":   {"type":"string","format":"date","title":"Sr DOM"},
      "SR_DSTE":  {"type":"string","format":"date","title":"Sr DSTE"},
      "CSTE_CON": {"type":"string","format":"date","title":"CSTE/Con"},
      "CTPM":     {"type":"string","format":"date","title":"CTPM"},
      "CSTE_OL":  {"type":"string","format":"date","title":"CSTE/OL"}
    }}'::jsonb, true)
WHERE code IN (
    'ST_LT_TOC_DRAWING_V1',
    'SWR_DRAWING_V1',
    'SWRD_DRAWING_V1',
    'FAT_DRAWING_V1',
    'SAT_DRAWING_V1'
);

-- ── Group B: RSP (Mini Diagram / Route Section Plan) ─────────────────────────
-- Dy CSTE → CSTE/Con
UPDATE form_definitions
SET schema_json = jsonb_set(schema_json, '{properties,approval_chain}',
    '{"type":"object","title":"Approving Authority","additionalProperties":false,"properties":{
      "DY_CSTE":  {"type":"string","format":"date","title":"Dy CSTE"},
      "CSTE_CON": {"type":"string","format":"date","title":"CSTE/Con"}
    }}'::jsonb, true)
WHERE code = 'RSP_DRAWING_V1';

-- ── Group C: Cable Route Plan ─────────────────────────────────────────────────
-- Dy CSTE → Sr DSTE
UPDATE form_definitions
SET schema_json = jsonb_set(schema_json, '{properties,approval_chain}',
    '{"type":"object","title":"Approving Authority","additionalProperties":false,"properties":{
      "DY_CSTE": {"type":"string","format":"date","title":"Dy CSTE"},
      "SR_DSTE": {"type":"string","format":"date","title":"Sr DSTE"}
    }}'::jsonb, true)
WHERE code = 'CABLE_ROUTE_PLAN_DRAWING_V1';

-- ── Group D: LOP ──────────────────────────────────────────────────────────────
-- Dy CEE → Sr DOM → Sr DEE/TRD → CEE/Con → PCEE
UPDATE form_definitions
SET schema_json = jsonb_set(schema_json, '{properties,approval_chain}',
    '{"type":"object","title":"Approving Authority","additionalProperties":false,"properties":{
      "DY_CEE":     {"type":"string","format":"date","title":"Dy CEE"},
      "SR_DOM":     {"type":"string","format":"date","title":"Sr DOM"},
      "SR_DEE_TRD": {"type":"string","format":"date","title":"Sr DEE/TRD"},
      "CEE_CON":    {"type":"string","format":"date","title":"CEE/Con"},
      "PCEE":       {"type":"string","format":"date","title":"PCEE"}
    }}'::jsonb, true)
WHERE code = 'LOP_DRAWING_V1';

-- ── Group E: Project Sheet ────────────────────────────────────────────────────
-- Dy CE → Sr DEN → Sr DEN/Co → Dy CE/Planning → CE/C → CE/Planning
UPDATE form_definitions
SET schema_json = jsonb_set(schema_json, '{properties,approval_chain}',
    '{"type":"object","title":"Approving Authority","additionalProperties":false,"properties":{
      "DY_CE":         {"type":"string","format":"date","title":"Dy CE"},
      "SR_DEN":        {"type":"string","format":"date","title":"Sr DEN"},
      "SR_DEN_CO":     {"type":"string","format":"date","title":"Sr DEN/Co"},
      "DY_CE_PLANNING":{"type":"string","format":"date","title":"Dy CE/Planning"},
      "CE_C":          {"type":"string","format":"date","title":"CE/C"},
      "CE_PLANNING":   {"type":"string","format":"date","title":"CE/Planning"}
    }}'::jsonb, true)
WHERE code = 'PROJECT_SHEET_DRAWING_V1';

-- ── Group F: GAD Mega, Major, Minor ──────────────────────────────────────────
-- Dy CE → Sr DEN → Sr DEN/Co → Dy CE/Design → CE/C → Dy CE/Bridge → CBE
UPDATE form_definitions
SET schema_json = jsonb_set(schema_json, '{properties,approval_chain}',
    '{"type":"object","title":"Approving Authority","additionalProperties":false,"properties":{
      "DY_CE":       {"type":"string","format":"date","title":"Dy CE"},
      "SR_DEN":      {"type":"string","format":"date","title":"Sr DEN"},
      "SR_DEN_CO":   {"type":"string","format":"date","title":"Sr DEN/Co"},
      "DY_CE_DESIGN":{"type":"string","format":"date","title":"Dy CE/Design"},
      "CE_C":        {"type":"string","format":"date","title":"CE/C"},
      "DY_CE_BRIDGE":{"type":"string","format":"date","title":"Dy CE/Bridge"},
      "CBE":         {"type":"string","format":"date","title":"CBE"}
    }}'::jsonb, true)
WHERE code IN (
    'GAD_MEGA_DRAWING_V1',
    'GAD_MAJOR_DRAWING_V1',
    'GAD_MINOR_DRAWING_V1'
);

-- ── Group G: LWR Plan ────────────────────────────────────────────────────────
-- Dy CE → Sr DEN → Sr DEN/Co → Dy CE/Planning → CE/C → Dy CE/Track → CTE
UPDATE form_definitions
SET schema_json = jsonb_set(schema_json, '{properties,approval_chain}',
    '{"type":"object","title":"Approving Authority","additionalProperties":false,"properties":{
      "DY_CE":         {"type":"string","format":"date","title":"Dy CE"},
      "SR_DEN":        {"type":"string","format":"date","title":"Sr DEN"},
      "SR_DEN_CO":     {"type":"string","format":"date","title":"Sr DEN/Co"},
      "DY_CE_PLANNING":{"type":"string","format":"date","title":"Dy CE/Planning"},
      "CE_C":          {"type":"string","format":"date","title":"CE/C"},
      "DY_CE_TRACK":   {"type":"string","format":"date","title":"Dy CE/Track"},
      "CTE":           {"type":"string","format":"date","title":"CTE"}
    }}'::jsonb, true)
WHERE code = 'LWR_PLAN_DRAWING_V1';

-- ── Group H: Grade Condonation, Bridge Minor Sanction, Yard Dispensation, ─────
--            Yard Minor Sanction, Station Building GAD, FOB GAD/TAD
-- Dy CE → Dy CSTE → Dy CEE → Sr DEN → Sr DEN/Co → Sr DOM → Sr DCM →
-- Sr DSTE → DRM → Dy CE/C → CE/C → Dy CE/Planning → CE/Planning →
-- Dy CE/Bridge → CBE
UPDATE form_definitions
SET schema_json = jsonb_set(schema_json, '{properties,approval_chain}',
    '{"type":"object","title":"Approving Authority","additionalProperties":false,"properties":{
      "DY_CE":         {"type":"string","format":"date","title":"Dy CE"},
      "DY_CSTE":       {"type":"string","format":"date","title":"Dy CSTE"},
      "DY_CEE":        {"type":"string","format":"date","title":"Dy CEE"},
      "SR_DEN":        {"type":"string","format":"date","title":"Sr DEN"},
      "SR_DEN_CO":     {"type":"string","format":"date","title":"Sr DEN/Co"},
      "SR_DOM":        {"type":"string","format":"date","title":"Sr DOM"},
      "SR_DCM":        {"type":"string","format":"date","title":"Sr DCM"},
      "SR_DSTE":       {"type":"string","format":"date","title":"Sr DSTE"},
      "DRM":           {"type":"string","format":"date","title":"DRM"},
      "DY_CE_C":       {"type":"string","format":"date","title":"Dy CE/C"},
      "CE_C":          {"type":"string","format":"date","title":"CE/C"},
      "DY_CE_PLANNING":{"type":"string","format":"date","title":"Dy CE/Planning"},
      "CE_PLANNING":   {"type":"string","format":"date","title":"CE/Planning"},
      "DY_CE_BRIDGE":  {"type":"string","format":"date","title":"Dy CE/Bridge"},
      "CBE":           {"type":"string","format":"date","title":"CBE"}
    }}'::jsonb, true)
WHERE code IN (
    'GRADE_CONDONATION_DRAWING_V1',
    'BRIDGE_MINOR_SANCTION_DRAWING_V1',
    'YARD_DISPENSATION_DRAWING_V1',
    'YARD_MINOR_SANCTION_DRAWING_V1',
    'STATION_BUILDING_GAD_DRAWING_V1',
    'FOB_GAD_TAD_DRAWING_V1'
);
