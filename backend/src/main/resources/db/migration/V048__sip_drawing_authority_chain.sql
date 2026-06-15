-- V048: Update SIP_DRAWING_V1 approval_chain.
-- Authorities: Dy CSTE, Sr DOM, Sr DSTE, CSTE/Con, CTPM, CSTE/OL

UPDATE form_definitions
SET schema_json = jsonb_set(
    schema_json,
    '{properties,approval_chain}',
    '{
      "type": "object",
      "title": "Approving Authority",
      "additionalProperties": false,
      "properties": {
        "DY_CSTE":  {"type":"string","format":"date","title":"Dy CSTE"},
        "SR_DOM":   {"type":"string","format":"date","title":"Sr DOM"},
        "SR_DSTE":  {"type":"string","format":"date","title":"Sr DSTE"},
        "CSTE_CON": {"type":"string","format":"date","title":"CSTE/Con"},
        "CTPM":     {"type":"string","format":"date","title":"CTPM"},
        "CSTE_OL":  {"type":"string","format":"date","title":"CSTE/OL"}
      }
    }'::jsonb,
    true
)
WHERE code = 'SIP_DRAWING_V1';
