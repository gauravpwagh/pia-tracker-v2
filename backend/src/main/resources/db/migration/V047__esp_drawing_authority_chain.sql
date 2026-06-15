-- V047: Update ESP_DRAWING_V1
--   1. Replace the 2-authority approval_chain with the full 15-authority list.
--   2. Remove the verbose schema description ("Earthwork / Slope Protection…").

-- ── 1. Remove schema-level description ───────────────────────────────────────
UPDATE form_definitions
SET schema_json = schema_json - 'description'
WHERE code = 'ESP_DRAWING_V1';

-- ── 2. Replace approval_chain with 15-authority chain ────────────────────────
-- Order per user: Dy CE, Dy CEE, Dy CSTE, Sr DEN, Sr DEN/Co, Sr DOM,
--   Sr DEE/TRD, Sr DSTE, Sr DCM, ADRM, DRM, CE/C, CTPM, CSTE/Con, CE/Planning
UPDATE form_definitions
SET schema_json = jsonb_set(
    schema_json,
    '{properties,approval_chain}',
    '{
      "type": "object",
      "title": "Approving Authority",
      "additionalProperties": false,
      "properties": {
        "DY_CE":       {"type":"string","format":"date","title":"Dy CE"},
        "DY_CEE":      {"type":"string","format":"date","title":"Dy CEE"},
        "DY_CSTE":     {"type":"string","format":"date","title":"Dy CSTE"},
        "SR_DEN":      {"type":"string","format":"date","title":"Sr DEN"},
        "SR_DEN_CO":   {"type":"string","format":"date","title":"Sr DEN/Co"},
        "SR_DOM":      {"type":"string","format":"date","title":"Sr DOM"},
        "SR_DEE_TRD":  {"type":"string","format":"date","title":"Sr DEE/TRD"},
        "SR_DSTE":     {"type":"string","format":"date","title":"Sr DSTE"},
        "SR_DCM":      {"type":"string","format":"date","title":"Sr DCM"},
        "ADRM":        {"type":"string","format":"date","title":"ADRM"},
        "DRM":         {"type":"string","format":"date","title":"DRM"},
        "CE_C":        {"type":"string","format":"date","title":"CE/C"},
        "CTPM":        {"type":"string","format":"date","title":"CTPM"},
        "CSTE_CON":    {"type":"string","format":"date","title":"CSTE/Con"},
        "CE_PLANNING": {"type":"string","format":"date","title":"CE/Planning"}
      }
    }'::jsonb,
    true
)
WHERE code = 'ESP_DRAWING_V1';
