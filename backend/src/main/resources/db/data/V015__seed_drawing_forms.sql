-- V015__seed_drawing_forms.sql
-- Phase 2.6: Seed the remaining 22 drawing form definitions.
--
-- Convention:
--   code             = {DRAWING_TYPE}_DRAWING_V1
--   activity_type_code = 'DRAWING_APPROVAL'
--   workflow_definition_id = null  (drawings use the checklist model, not the engine)
--   section_codes    = '{}'
--   default_approver_designations = ARRAY[...] in approval order
--
-- All designation codes referenced here exist in V001_003__seed_designations.sql.
-- ESP_DRAWING_V1 was seeded in V014_002; this file adds the remaining 22 types.

-- ── 2. SIP (Site Investigation Plan) ─────────────────────────────────────────
INSERT INTO form_definitions (
    id, activity_type_code, code, version, label,
    workflow_definition_id, section_codes, default_approver_designations,
    is_active, schema_json, ui_schema_json
) VALUES (
    'ffffffff-0006-0002-0001-000000000001',
    'DRAWING_APPROVAL', 'SIP_DRAWING_V1', 1, 'SIP Drawing v1',
    null, '{}', ARRAY['SR_DEN','DY_CE','CE_PLANNING'], true,
    $schema$
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://pia.tracker/schemas/drawing/SIP_DRAWING_V1/1.json",
  "type": "object",
  "title": "SIP Drawing",
  "description": "Site Investigation Plan. Approved via drawing checklist (SR DEN → Dy CE → CE/Planning).",
  "required": ["drawing_number"],
  "additionalProperties": false,
  "properties": {
    "drawing_number":      { "type": "string", "title": "Drawing Number", "minLength": 1, "maxLength": 64 },
    "drawing_title":       { "type": "string", "title": "Drawing Title",  "maxLength": 256 },
    "name_of_section":     { "type": "string", "title": "Name of Section", "maxLength": 256 },
    "investigation_type":  { "type": "string", "title": "Investigation Type",
                             "enum": ["SOIL","GEOLOGICAL","HYDROLOGICAL","OTHER"] },
    "investigation_agency":{ "type": "string", "title": "Investigation Agency", "maxLength": 256 },
    "revision_number":     { "type": "integer","title": "Revision Number", "minimum": 0 },
    "remarks":             { "type": "string", "title": "Remarks", "maxLength": 2048 }
  }
}
$schema$,
    $ui_schema$
{
  "ui:order": ["drawing_number","drawing_title","name_of_section","investigation_type","investigation_agency","revision_number","remarks"]
}
$ui_schema$
);

-- ── 3. ST_LT_TOC (Short Turn / Long Turn / Turnout Change) ───────────────────
INSERT INTO form_definitions (
    id, activity_type_code, code, version, label,
    workflow_definition_id, section_codes, default_approver_designations,
    is_active, schema_json, ui_schema_json
) VALUES (
    'ffffffff-0006-0003-0001-000000000001',
    'DRAWING_APPROVAL', 'ST_LT_TOC_DRAWING_V1', 1, 'ST/LT/TOC Drawing v1',
    null, '{}', ARRAY['SR_DEN','DY_CE_TRACK','CTE'], true,
    $schema$
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://pia.tracker/schemas/drawing/ST_LT_TOC_DRAWING_V1/1.json",
  "type": "object",
  "title": "ST/LT/TOC Drawing",
  "description": "Short Turn / Long Turn / Turnout Change drawing.",
  "required": ["drawing_number"],
  "additionalProperties": false,
  "properties": {
    "drawing_number":          { "type": "string",  "title": "Drawing Number", "minLength": 1, "maxLength": 64 },
    "drawing_title":           { "type": "string",  "title": "Drawing Title",  "maxLength": 256 },
    "name_of_section":         { "type": "string",  "title": "Name of Section","maxLength": 256 },
    "turnout_type":            { "type": "string",  "title": "Turnout Type",
                                 "enum": ["A_TURNOUT","B_TURNOUT","SYMMETRICAL","OTHER"] },
    "track_centre_spacing_m":  { "type": "number",  "title": "Track Centre Spacing (m)", "minimum": 0 },
    "revision_number":         { "type": "integer", "title": "Revision Number", "minimum": 0 },
    "remarks":                 { "type": "string",  "title": "Remarks", "maxLength": 2048 }
  }
}
$schema$,
    $ui_schema$
{
  "ui:order": ["drawing_number","drawing_title","name_of_section","turnout_type","track_centre_spacing_m","revision_number","remarks"]
}
$ui_schema$
);

-- ── 4. SWR (Station Working Rules) ───────────────────────────────────────────
INSERT INTO form_definitions (
    id, activity_type_code, code, version, label,
    workflow_definition_id, section_codes, default_approver_designations,
    is_active, schema_json, ui_schema_json
) VALUES (
    'ffffffff-0006-0004-0001-000000000001',
    'DRAWING_APPROVAL', 'SWR_DRAWING_V1', 1, 'SWR Drawing v1',
    null, '{}', ARRAY['SR_DOM','ADRM','DRM'], true,
    $schema$
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://pia.tracker/schemas/drawing/SWR_DRAWING_V1/1.json",
  "type": "object",
  "title": "SWR Drawing",
  "description": "Station Working Rules drawing.",
  "required": ["drawing_number","station_name"],
  "additionalProperties": false,
  "properties": {
    "drawing_number":  { "type": "string", "title": "Drawing Number", "minLength": 1, "maxLength": 64 },
    "drawing_title":   { "type": "string", "title": "Drawing Title",  "maxLength": 256 },
    "station_name":    { "type": "string", "title": "Station Name",   "minLength": 1, "maxLength": 256 },
    "effective_from":  { "type": "string", "title": "Effective From", "format": "date" },
    "revision_number": { "type": "integer","title": "Revision Number","minimum": 0 },
    "remarks":         { "type": "string", "title": "Remarks",        "maxLength": 2048 }
  }
}
$schema$,
    $ui_schema$
{
  "ui:order": ["drawing_number","drawing_title","station_name","effective_from","revision_number","remarks"]
}
$ui_schema$
);

-- ── 5. SWRD (Station Working Rules Drawing) ───────────────────────────────────
INSERT INTO form_definitions (
    id, activity_type_code, code, version, label,
    workflow_definition_id, section_codes, default_approver_designations,
    is_active, schema_json, ui_schema_json
) VALUES (
    'ffffffff-0006-0005-0001-000000000001',
    'DRAWING_APPROVAL', 'SWRD_DRAWING_V1', 1, 'SWRD Drawing v1',
    null, '{}', ARRAY['SR_DEN','SR_DOM','ADRM'], true,
    $schema$
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://pia.tracker/schemas/drawing/SWRD_DRAWING_V1/1.json",
  "type": "object",
  "title": "SWRD Drawing",
  "description": "Station Working Rules Drawing (yard layout for SWR).",
  "required": ["drawing_number","station_name"],
  "additionalProperties": false,
  "properties": {
    "drawing_number":    { "type": "string", "title": "Drawing Number",   "minLength": 1, "maxLength": 64 },
    "drawing_title":     { "type": "string", "title": "Drawing Title",    "maxLength": 256 },
    "station_name":      { "type": "string", "title": "Station Name",     "minLength": 1, "maxLength": 256 },
    "yard_layout_type":  { "type": "string", "title": "Yard Layout Type", "maxLength": 128 },
    "revision_number":   { "type": "integer","title": "Revision Number",  "minimum": 0 },
    "remarks":           { "type": "string", "title": "Remarks",          "maxLength": 2048 }
  }
}
$schema$,
    $ui_schema$
{
  "ui:order": ["drawing_number","drawing_title","station_name","yard_layout_type","revision_number","remarks"]
}
$ui_schema$
);

-- ── 6. FAT (Full Alignment Track) ─────────────────────────────────────────────
INSERT INTO form_definitions (
    id, activity_type_code, code, version, label,
    workflow_definition_id, section_codes, default_approver_designations,
    is_active, schema_json, ui_schema_json
) VALUES (
    'ffffffff-0006-0006-0001-000000000001',
    'DRAWING_APPROVAL', 'FAT_DRAWING_V1', 1, 'FAT Drawing v1',
    null, '{}', ARRAY['SR_DEN','DY_CE_TRACK','CTE'], true,
    $schema$
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://pia.tracker/schemas/drawing/FAT_DRAWING_V1/1.json",
  "type": "object",
  "title": "FAT Drawing",
  "description": "Full Alignment Track drawing.",
  "required": ["drawing_number"],
  "additionalProperties": false,
  "properties": {
    "drawing_number":  { "type": "string", "title": "Drawing Number", "minLength": 1, "maxLength": 64 },
    "drawing_title":   { "type": "string", "title": "Drawing Title",  "maxLength": 256 },
    "name_of_section": { "type": "string", "title": "Name of Section","maxLength": 256 },
    "chainage_from":   { "$ref": "#/$defs/Chainage", "title": "Chainage From" },
    "chainage_to":     { "$ref": "#/$defs/Chainage", "title": "Chainage To" },
    "track_type":      { "type": "string", "title": "Track Type",     "maxLength": 64 },
    "revision_number": { "type": "integer","title": "Revision Number","minimum": 0 },
    "remarks":         { "type": "string", "title": "Remarks",        "maxLength": 2048 }
  },
  "$defs": { "Chainage": { "type": "string", "pattern": "^[0-9]+\\+[0-9]{3}$" } }
}
$schema$,
    $ui_schema$
{
  "ui:order": ["drawing_number","drawing_title","name_of_section","chainage_from","chainage_to","track_type","revision_number","remarks"],
  "chainage_from": { "ui:widget": "chainage" },
  "chainage_to":   { "ui:widget": "chainage" }
}
$ui_schema$
);

-- ── 7. SAT (Short Alignment Track) ───────────────────────────────────────────
INSERT INTO form_definitions (
    id, activity_type_code, code, version, label,
    workflow_definition_id, section_codes, default_approver_designations,
    is_active, schema_json, ui_schema_json
) VALUES (
    'ffffffff-0006-0007-0001-000000000001',
    'DRAWING_APPROVAL', 'SAT_DRAWING_V1', 1, 'SAT Drawing v1',
    null, '{}', ARRAY['SR_DEN','DY_CE_TRACK'], true,
    $schema$
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://pia.tracker/schemas/drawing/SAT_DRAWING_V1/1.json",
  "type": "object",
  "title": "SAT Drawing",
  "description": "Short Alignment Track drawing.",
  "required": ["drawing_number"],
  "additionalProperties": false,
  "properties": {
    "drawing_number":  { "type": "string", "title": "Drawing Number", "minLength": 1, "maxLength": 64 },
    "drawing_title":   { "type": "string", "title": "Drawing Title",  "maxLength": 256 },
    "name_of_section": { "type": "string", "title": "Name of Section","maxLength": 256 },
    "chainage_from":   { "$ref": "#/$defs/Chainage", "title": "Chainage From" },
    "chainage_to":     { "$ref": "#/$defs/Chainage", "title": "Chainage To" },
    "revision_number": { "type": "integer","title": "Revision Number","minimum": 0 },
    "remarks":         { "type": "string", "title": "Remarks",        "maxLength": 2048 }
  },
  "$defs": { "Chainage": { "type": "string", "pattern": "^[0-9]+\\+[0-9]{3}$" } }
}
$schema$,
    $ui_schema$
{
  "ui:order": ["drawing_number","drawing_title","name_of_section","chainage_from","chainage_to","revision_number","remarks"],
  "chainage_from": { "ui:widget": "chainage" },
  "chainage_to":   { "ui:widget": "chainage" }
}
$ui_schema$
);

-- ── 8. RSP (Route Setting Panel) ──────────────────────────────────────────────
INSERT INTO form_definitions (
    id, activity_type_code, code, version, label,
    workflow_definition_id, section_codes, default_approver_designations,
    is_active, schema_json, ui_schema_json
) VALUES (
    'ffffffff-0006-0008-0001-000000000001',
    'DRAWING_APPROVAL', 'RSP_DRAWING_V1', 1, 'RSP Drawing v1',
    null, '{}', ARRAY['SR_DSTE','DY_CSTE','CSTE_CON'], true,
    $schema$
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://pia.tracker/schemas/drawing/RSP_DRAWING_V1/1.json",
  "type": "object",
  "title": "RSP Drawing",
  "description": "Route Setting Panel drawing (S&T).",
  "required": ["drawing_number","station_name"],
  "additionalProperties": false,
  "properties": {
    "drawing_number":  { "type": "string", "title": "Drawing Number", "minLength": 1, "maxLength": 64 },
    "drawing_title":   { "type": "string", "title": "Drawing Title",  "maxLength": 256 },
    "station_name":    { "type": "string", "title": "Station Name",   "minLength": 1, "maxLength": 256 },
    "panel_type":      { "type": "string", "title": "Panel Type",     "maxLength": 128 },
    "revision_number": { "type": "integer","title": "Revision Number","minimum": 0 },
    "remarks":         { "type": "string", "title": "Remarks",        "maxLength": 2048 }
  }
}
$schema$,
    $ui_schema$
{
  "ui:order": ["drawing_number","drawing_title","station_name","panel_type","revision_number","remarks"]
}
$ui_schema$
);

-- ── 9. CABLE_ROUTE_PLAN ────────────────────────────────────────────────────────
INSERT INTO form_definitions (
    id, activity_type_code, code, version, label,
    workflow_definition_id, section_codes, default_approver_designations,
    is_active, schema_json, ui_schema_json
) VALUES (
    'ffffffff-0006-0009-0001-000000000001',
    'DRAWING_APPROVAL', 'CABLE_ROUTE_PLAN_DRAWING_V1', 1, 'Cable Route Plan Drawing v1',
    null, '{}', ARRAY['SR_DEE_TRD','DY_CEE','CEE_CON'], true,
    $schema$
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://pia.tracker/schemas/drawing/CABLE_ROUTE_PLAN_DRAWING_V1/1.json",
  "type": "object",
  "title": "Cable Route Plan Drawing",
  "description": "Cable Route Plan (Electrical / TRD).",
  "required": ["drawing_number"],
  "additionalProperties": false,
  "properties": {
    "drawing_number":  { "type": "string", "title": "Drawing Number", "minLength": 1, "maxLength": 64 },
    "drawing_title":   { "type": "string", "title": "Drawing Title",  "maxLength": 256 },
    "name_of_section": { "type": "string", "title": "Name of Section","maxLength": 256 },
    "chainage_from":   { "$ref": "#/$defs/Chainage", "title": "Chainage From" },
    "chainage_to":     { "$ref": "#/$defs/Chainage", "title": "Chainage To" },
    "cable_type":      { "type": "string", "title": "Cable Type",
                         "enum": ["OFC","POWER","SIGNAL","TELECOM","OTHER"] },
    "revision_number": { "type": "integer","title": "Revision Number","minimum": 0 },
    "remarks":         { "type": "string", "title": "Remarks",        "maxLength": 2048 }
  },
  "$defs": { "Chainage": { "type": "string", "pattern": "^[0-9]+\\+[0-9]{3}$" } }
}
$schema$,
    $ui_schema$
{
  "ui:order": ["drawing_number","drawing_title","name_of_section","chainage_from","chainage_to","cable_type","revision_number","remarks"],
  "chainage_from": { "ui:widget": "chainage" },
  "chainage_to":   { "ui:widget": "chainage" }
}
$ui_schema$
);

-- ── 10. LOP (Layout of Platform) ──────────────────────────────────────────────
INSERT INTO form_definitions (
    id, activity_type_code, code, version, label,
    workflow_definition_id, section_codes, default_approver_designations,
    is_active, schema_json, ui_schema_json
) VALUES (
    'ffffffff-0006-0010-0001-000000000001',
    'DRAWING_APPROVAL', 'LOP_DRAWING_V1', 1, 'LOP Drawing v1',
    null, '{}', ARRAY['SR_DEN','SR_DOM','ADRM'], true,
    $schema$
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://pia.tracker/schemas/drawing/LOP_DRAWING_V1/1.json",
  "type": "object",
  "title": "LOP Drawing",
  "description": "Layout of Platform drawing.",
  "required": ["drawing_number","station_name"],
  "additionalProperties": false,
  "properties": {
    "drawing_number":     { "type": "string",  "title": "Drawing Number",     "minLength": 1, "maxLength": 64 },
    "drawing_title":      { "type": "string",  "title": "Drawing Title",      "maxLength": 256 },
    "station_name":       { "type": "string",  "title": "Station Name",       "minLength": 1, "maxLength": 256 },
    "platform_number":    { "type": "integer", "title": "Platform Number",    "minimum": 1 },
    "platform_length_m":  { "type": "number",  "title": "Platform Length (m)","minimum": 0 },
    "revision_number":    { "type": "integer", "title": "Revision Number",    "minimum": 0 },
    "remarks":            { "type": "string",  "title": "Remarks",            "maxLength": 2048 }
  }
}
$schema$,
    $ui_schema$
{
  "ui:order": ["drawing_number","drawing_title","station_name","platform_number","platform_length_m","revision_number","remarks"]
}
$ui_schema$
);

-- ── 11. PROJECT_SHEET ─────────────────────────────────────────────────────────
INSERT INTO form_definitions (
    id, activity_type_code, code, version, label,
    workflow_definition_id, section_codes, default_approver_designations,
    is_active, schema_json, ui_schema_json
) VALUES (
    'ffffffff-0006-0011-0001-000000000001',
    'DRAWING_APPROVAL', 'PROJECT_SHEET_DRAWING_V1', 1, 'Project Sheet Drawing v1',
    null, '{}', ARRAY['SR_DEN','DY_CE','CE_PLANNING'], true,
    $schema$
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://pia.tracker/schemas/drawing/PROJECT_SHEET_DRAWING_V1/1.json",
  "type": "object",
  "title": "Project Sheet Drawing",
  "description": "Project sheet / index drawing for a section.",
  "required": ["drawing_number"],
  "additionalProperties": false,
  "properties": {
    "drawing_number":       { "type": "string", "title": "Drawing Number",      "minLength": 1, "maxLength": 64 },
    "drawing_title":        { "type": "string", "title": "Drawing Title",       "maxLength": 256 },
    "name_of_section":      { "type": "string", "title": "Name of Section",     "maxLength": 256 },
    "chainage_from":        { "$ref": "#/$defs/Chainage", "title": "Chainage From" },
    "chainage_to":          { "$ref": "#/$defs/Chainage", "title": "Chainage To" },
    "section_description":  { "type": "string", "title": "Section Description", "maxLength": 1024 },
    "revision_number":      { "type": "integer","title": "Revision Number",     "minimum": 0 },
    "remarks":              { "type": "string", "title": "Remarks",             "maxLength": 2048 }
  },
  "$defs": { "Chainage": { "type": "string", "pattern": "^[0-9]+\\+[0-9]{3}$" } }
}
$schema$,
    $ui_schema$
{
  "ui:order": ["drawing_number","drawing_title","name_of_section","chainage_from","chainage_to","section_description","revision_number","remarks"],
  "chainage_from": { "ui:widget": "chainage" },
  "chainage_to":   { "ui:widget": "chainage" }
}
$ui_schema$
);

-- ── 12. GAD_MEGA (General Arrangement Drawing — Mega Bridge) ──────────────────
INSERT INTO form_definitions (
    id, activity_type_code, code, version, label,
    workflow_definition_id, section_codes, default_approver_designations,
    is_active, schema_json, ui_schema_json
) VALUES (
    'ffffffff-0006-0012-0001-000000000001',
    'DRAWING_APPROVAL', 'GAD_MEGA_DRAWING_V1', 1, 'GAD Mega Bridge Drawing v1',
    null, '{}', ARRAY['CBE','DY_CE_BRIDGE','PCE'], true,
    $schema$
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://pia.tracker/schemas/drawing/GAD_MEGA_DRAWING_V1/1.json",
  "type": "object",
  "title": "GAD Mega Bridge Drawing",
  "description": "General Arrangement Drawing for a mega bridge (span > 300 m or height > 30 m).",
  "required": ["drawing_number","bridge_chainage"],
  "additionalProperties": false,
  "properties": {
    "drawing_number":    { "type": "string", "title": "Drawing Number",   "minLength": 1, "maxLength": 64 },
    "drawing_title":     { "type": "string", "title": "Drawing Title",    "maxLength": 256 },
    "bridge_chainage":   { "$ref": "#/$defs/Chainage", "title": "Bridge Chainage" },
    "span_arrangement":  { "type": "string", "title": "Span Arrangement", "maxLength": 256 },
    "deck_type":         { "type": "string", "title": "Deck Type",
                           "enum": ["SIMPLY_SUPPORTED","CONTINUOUS","CANTILEVER","ARCH","CABLE_STAYED","OTHER"] },
    "total_span_m":      { "type": "number",  "title": "Total Span (m)",  "minimum": 0 },
    "revision_number":   { "type": "integer", "title": "Revision Number", "minimum": 0 },
    "remarks":           { "type": "string",  "title": "Remarks",         "maxLength": 2048 }
  },
  "$defs": { "Chainage": { "type": "string", "pattern": "^[0-9]+\\+[0-9]{3}$" } }
}
$schema$,
    $ui_schema$
{
  "ui:order": ["drawing_number","drawing_title","bridge_chainage","span_arrangement","deck_type","total_span_m","revision_number","remarks"],
  "bridge_chainage": { "ui:widget": "chainage" }
}
$ui_schema$
);

-- ── 13. GAD_MAJOR (General Arrangement Drawing — Major Bridge) ────────────────
INSERT INTO form_definitions (
    id, activity_type_code, code, version, label,
    workflow_definition_id, section_codes, default_approver_designations,
    is_active, schema_json, ui_schema_json
) VALUES (
    'ffffffff-0006-0013-0001-000000000001',
    'DRAWING_APPROVAL', 'GAD_MAJOR_DRAWING_V1', 1, 'GAD Major Bridge Drawing v1',
    null, '{}', ARRAY['CBE','DY_CE_BRIDGE','SR_DEN'], true,
    $schema$
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://pia.tracker/schemas/drawing/GAD_MAJOR_DRAWING_V1/1.json",
  "type": "object",
  "title": "GAD Major Bridge Drawing",
  "description": "General Arrangement Drawing for a major bridge.",
  "required": ["drawing_number","bridge_chainage"],
  "additionalProperties": false,
  "properties": {
    "drawing_number":   { "type": "string",  "title": "Drawing Number",   "minLength": 1, "maxLength": 64 },
    "drawing_title":    { "type": "string",  "title": "Drawing Title",    "maxLength": 256 },
    "bridge_chainage":  { "$ref": "#/$defs/Chainage", "title": "Bridge Chainage" },
    "span_arrangement": { "type": "string",  "title": "Span Arrangement", "maxLength": 256 },
    "total_span_m":     { "type": "number",  "title": "Total Span (m)",   "minimum": 0 },
    "revision_number":  { "type": "integer", "title": "Revision Number",  "minimum": 0 },
    "remarks":          { "type": "string",  "title": "Remarks",          "maxLength": 2048 }
  },
  "$defs": { "Chainage": { "type": "string", "pattern": "^[0-9]+\\+[0-9]{3}$" } }
}
$schema$,
    $ui_schema$
{
  "ui:order": ["drawing_number","drawing_title","bridge_chainage","span_arrangement","total_span_m","revision_number","remarks"],
  "bridge_chainage": { "ui:widget": "chainage" }
}
$ui_schema$
);

-- ── 14. GAD_MINOR (General Arrangement Drawing — Minor Bridge) ────────────────
INSERT INTO form_definitions (
    id, activity_type_code, code, version, label,
    workflow_definition_id, section_codes, default_approver_designations,
    is_active, schema_json, ui_schema_json
) VALUES (
    'ffffffff-0006-0014-0001-000000000001',
    'DRAWING_APPROVAL', 'GAD_MINOR_DRAWING_V1', 1, 'GAD Minor Bridge Drawing v1',
    null, '{}', ARRAY['DY_CE_BRIDGE','SR_DEN'], true,
    $schema$
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://pia.tracker/schemas/drawing/GAD_MINOR_DRAWING_V1/1.json",
  "type": "object",
  "title": "GAD Minor Bridge Drawing",
  "description": "General Arrangement Drawing for a minor bridge (span <= 6 m).",
  "required": ["drawing_number","bridge_chainage"],
  "additionalProperties": false,
  "properties": {
    "drawing_number":  { "type": "string",  "title": "Drawing Number", "minLength": 1, "maxLength": 64 },
    "drawing_title":   { "type": "string",  "title": "Drawing Title",  "maxLength": 256 },
    "bridge_chainage": { "$ref": "#/$defs/Chainage", "title": "Bridge Chainage" },
    "span_type":       { "type": "string",  "title": "Span Type",
                         "enum": ["SLAB","BOX","ARCH","PIPE_CULVERT","OTHER"] },
    "span_m":          { "type": "number",  "title": "Span (m)",       "minimum": 0 },
    "revision_number": { "type": "integer", "title": "Revision Number","minimum": 0 },
    "remarks":         { "type": "string",  "title": "Remarks",        "maxLength": 2048 }
  },
  "$defs": { "Chainage": { "type": "string", "pattern": "^[0-9]+\\+[0-9]{3}$" } }
}
$schema$,
    $ui_schema$
{
  "ui:order": ["drawing_number","drawing_title","bridge_chainage","span_type","span_m","revision_number","remarks"],
  "bridge_chainage": { "ui:widget": "chainage" }
}
$ui_schema$
);

-- ── 15. LWR_PLAN (Long Welded Rail Plan) ──────────────────────────────────────
INSERT INTO form_definitions (
    id, activity_type_code, code, version, label,
    workflow_definition_id, section_codes, default_approver_designations,
    is_active, schema_json, ui_schema_json
) VALUES (
    'ffffffff-0006-0015-0001-000000000001',
    'DRAWING_APPROVAL', 'LWR_PLAN_DRAWING_V1', 1, 'LWR Plan Drawing v1',
    null, '{}', ARRAY['SR_DEN','DY_CE_TRACK','CTE'], true,
    $schema$
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://pia.tracker/schemas/drawing/LWR_PLAN_DRAWING_V1/1.json",
  "type": "object",
  "title": "LWR Plan Drawing",
  "description": "Long Welded Rail Plan.",
  "required": ["drawing_number"],
  "additionalProperties": false,
  "properties": {
    "drawing_number":  { "type": "string",  "title": "Drawing Number", "minLength": 1, "maxLength": 64 },
    "drawing_title":   { "type": "string",  "title": "Drawing Title",  "maxLength": 256 },
    "name_of_section": { "type": "string",  "title": "Name of Section","maxLength": 256 },
    "chainage_from":   { "$ref": "#/$defs/Chainage", "title": "Chainage From" },
    "chainage_to":     { "$ref": "#/$defs/Chainage", "title": "Chainage To" },
    "rail_section":    { "type": "string",  "title": "Rail Section (kg/m)", "maxLength": 32 },
    "revision_number": { "type": "integer", "title": "Revision Number","minimum": 0 },
    "remarks":         { "type": "string",  "title": "Remarks",        "maxLength": 2048 }
  },
  "$defs": { "Chainage": { "type": "string", "pattern": "^[0-9]+\\+[0-9]{3}$" } }
}
$schema$,
    $ui_schema$
{
  "ui:order": ["drawing_number","drawing_title","name_of_section","chainage_from","chainage_to","rail_section","revision_number","remarks"],
  "chainage_from": { "ui:widget": "chainage" },
  "chainage_to":   { "ui:widget": "chainage" }
}
$ui_schema$
);

-- ── 16. CURVE_DETAILS ─────────────────────────────────────────────────────────
INSERT INTO form_definitions (
    id, activity_type_code, code, version, label,
    workflow_definition_id, section_codes, default_approver_designations,
    is_active, schema_json, ui_schema_json
) VALUES (
    'ffffffff-0006-0016-0001-000000000001',
    'DRAWING_APPROVAL', 'CURVE_DETAILS_DRAWING_V1', 1, 'Curve Details Drawing v1',
    null, '{}', ARRAY['SR_DEN','DY_CE_TRACK'], true,
    $schema$
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://pia.tracker/schemas/drawing/CURVE_DETAILS_DRAWING_V1/1.json",
  "type": "object",
  "title": "Curve Details Drawing",
  "description": "Horizontal / vertical curve details drawing.",
  "required": ["drawing_number","curve_number"],
  "additionalProperties": false,
  "properties": {
    "drawing_number":  { "type": "string",  "title": "Drawing Number",    "minLength": 1, "maxLength": 64 },
    "drawing_title":   { "type": "string",  "title": "Drawing Title",     "maxLength": 256 },
    "curve_number":    { "type": "string",  "title": "Curve Number",      "minLength": 1, "maxLength": 32 },
    "chainage":        { "$ref": "#/$defs/Chainage", "title": "Curve Chainage" },
    "radius_m":        { "type": "number",  "title": "Radius (m)",        "minimum": 0 },
    "degree_of_curve": { "type": "number",  "title": "Degree of Curve",   "minimum": 0 },
    "revision_number": { "type": "integer", "title": "Revision Number",   "minimum": 0 },
    "remarks":         { "type": "string",  "title": "Remarks",           "maxLength": 2048 }
  },
  "$defs": { "Chainage": { "type": "string", "pattern": "^[0-9]+\\+[0-9]{3}$" } }
}
$schema$,
    $ui_schema$
{
  "ui:order": ["drawing_number","drawing_title","curve_number","chainage","radius_m","degree_of_curve","revision_number","remarks"],
  "chainage": { "ui:widget": "chainage" }
}
$ui_schema$
);

-- ── 17. GRADE_CONDONATION ─────────────────────────────────────────────────────
INSERT INTO form_definitions (
    id, activity_type_code, code, version, label,
    workflow_definition_id, section_codes, default_approver_designations,
    is_active, schema_json, ui_schema_json
) VALUES (
    'ffffffff-0006-0017-0001-000000000001',
    'DRAWING_APPROVAL', 'GRADE_CONDONATION_DRAWING_V1', 1, 'Grade Condonation Drawing v1',
    null, '{}', ARRAY['SR_DEN','DY_CE','CE_PLANNING'], true,
    $schema$
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://pia.tracker/schemas/drawing/GRADE_CONDONATION_DRAWING_V1/1.json",
  "type": "object",
  "title": "Grade Condonation Drawing",
  "description": "Grade condonation request drawing (steeper grade than prescribed).",
  "required": ["drawing_number"],
  "additionalProperties": false,
  "properties": {
    "drawing_number":     { "type": "string",  "title": "Drawing Number",        "minLength": 1, "maxLength": 64 },
    "drawing_title":      { "type": "string",  "title": "Drawing Title",         "maxLength": 256 },
    "name_of_section":    { "type": "string",  "title": "Name of Section",       "maxLength": 256 },
    "chainage_from":      { "$ref": "#/$defs/Chainage", "title": "Chainage From" },
    "chainage_to":        { "$ref": "#/$defs/Chainage", "title": "Chainage To" },
    "grade_percentage":   { "type": "number",  "title": "Grade (%)",             "minimum": 0 },
    "condonation_reason": { "type": "string",  "title": "Reason for Condonation","maxLength": 1024 },
    "revision_number":    { "type": "integer", "title": "Revision Number",       "minimum": 0 },
    "remarks":            { "type": "string",  "title": "Remarks",               "maxLength": 2048 }
  },
  "$defs": { "Chainage": { "type": "string", "pattern": "^[0-9]+\\+[0-9]{3}$" } }
}
$schema$,
    $ui_schema$
{
  "ui:order": ["drawing_number","drawing_title","name_of_section","chainage_from","chainage_to","grade_percentage","condonation_reason","revision_number","remarks"],
  "chainage_from": { "ui:widget": "chainage" },
  "chainage_to":   { "ui:widget": "chainage" }
}
$ui_schema$
);

-- ── 18. BRIDGE_MINOR_SANCTION ─────────────────────────────────────────────────
INSERT INTO form_definitions (
    id, activity_type_code, code, version, label,
    workflow_definition_id, section_codes, default_approver_designations,
    is_active, schema_json, ui_schema_json
) VALUES (
    'ffffffff-0006-0018-0001-000000000001',
    'DRAWING_APPROVAL', 'BRIDGE_MINOR_SANCTION_DRAWING_V1', 1, 'Bridge Minor Sanction Drawing v1',
    null, '{}', ARRAY['DY_CE_BRIDGE','SR_DEN'], true,
    $schema$
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://pia.tracker/schemas/drawing/BRIDGE_MINOR_SANCTION_DRAWING_V1/1.json",
  "type": "object",
  "title": "Bridge Minor Sanction Drawing",
  "description": "Sanction drawing for minor bridge works.",
  "required": ["drawing_number","bridge_chainage"],
  "additionalProperties": false,
  "properties": {
    "drawing_number":         { "type": "string",  "title": "Drawing Number",         "minLength": 1, "maxLength": 64 },
    "drawing_title":          { "type": "string",  "title": "Drawing Title",          "maxLength": 256 },
    "bridge_chainage":        { "$ref": "#/$defs/Chainage", "title": "Bridge Chainage" },
    "estimated_cost_lakhs":   { "type": "number",  "title": "Estimated Cost (₹ Lakhs)","minimum": 0 },
    "revision_number":        { "type": "integer", "title": "Revision Number",        "minimum": 0 },
    "remarks":                { "type": "string",  "title": "Remarks",                "maxLength": 2048 }
  },
  "$defs": { "Chainage": { "type": "string", "pattern": "^[0-9]+\\+[0-9]{3}$" } }
}
$schema$,
    $ui_schema$
{
  "ui:order": ["drawing_number","drawing_title","bridge_chainage","estimated_cost_lakhs","revision_number","remarks"],
  "bridge_chainage": { "ui:widget": "chainage" }
}
$ui_schema$
);

-- ── 19. YARD_DISPENSATION ─────────────────────────────────────────────────────
INSERT INTO form_definitions (
    id, activity_type_code, code, version, label,
    workflow_definition_id, section_codes, default_approver_designations,
    is_active, schema_json, ui_schema_json
) VALUES (
    'ffffffff-0006-0019-0001-000000000001',
    'DRAWING_APPROVAL', 'YARD_DISPENSATION_DRAWING_V1', 1, 'Yard Dispensation Drawing v1',
    null, '{}', ARRAY['SR_DEN','DY_CE','SR_DOM','ADRM'], true,
    $schema$
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://pia.tracker/schemas/drawing/YARD_DISPENSATION_DRAWING_V1/1.json",
  "type": "object",
  "title": "Yard Dispensation Drawing",
  "description": "Yard layout dispensation from prescribed standards.",
  "required": ["drawing_number","station_name"],
  "additionalProperties": false,
  "properties": {
    "drawing_number":     { "type": "string", "title": "Drawing Number",    "minLength": 1, "maxLength": 64 },
    "drawing_title":      { "type": "string", "title": "Drawing Title",     "maxLength": 256 },
    "station_name":       { "type": "string", "title": "Station Name",      "minLength": 1, "maxLength": 256 },
    "dispensation_type":  { "type": "string", "title": "Dispensation Type", "maxLength": 128 },
    "deviation_details":  { "type": "string", "title": "Deviation Details", "maxLength": 1024 },
    "revision_number":    { "type": "integer","title": "Revision Number",   "minimum": 0 },
    "remarks":            { "type": "string", "title": "Remarks",           "maxLength": 2048 }
  }
}
$schema$,
    $ui_schema$
{
  "ui:order": ["drawing_number","drawing_title","station_name","dispensation_type","deviation_details","revision_number","remarks"]
}
$ui_schema$
);

-- ── 20. YARD_MINOR_SANCTION ───────────────────────────────────────────────────
INSERT INTO form_definitions (
    id, activity_type_code, code, version, label,
    workflow_definition_id, section_codes, default_approver_designations,
    is_active, schema_json, ui_schema_json
) VALUES (
    'ffffffff-0006-0020-0001-000000000001',
    'DRAWING_APPROVAL', 'YARD_MINOR_SANCTION_DRAWING_V1', 1, 'Yard Minor Sanction Drawing v1',
    null, '{}', ARRAY['SR_DEN','ADRM'], true,
    $schema$
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://pia.tracker/schemas/drawing/YARD_MINOR_SANCTION_DRAWING_V1/1.json",
  "type": "object",
  "title": "Yard Minor Sanction Drawing",
  "description": "Sanction drawing for minor yard modification works.",
  "required": ["drawing_number","station_name"],
  "additionalProperties": false,
  "properties": {
    "drawing_number":       { "type": "string",  "title": "Drawing Number",         "minLength": 1, "maxLength": 64 },
    "drawing_title":        { "type": "string",  "title": "Drawing Title",          "maxLength": 256 },
    "station_name":         { "type": "string",  "title": "Station Name",           "minLength": 1, "maxLength": 256 },
    "estimated_cost_lakhs": { "type": "number",  "title": "Estimated Cost (₹ Lakhs)","minimum": 0 },
    "revision_number":      { "type": "integer", "title": "Revision Number",        "minimum": 0 },
    "remarks":              { "type": "string",  "title": "Remarks",                "maxLength": 2048 }
  }
}
$schema$,
    $ui_schema$
{
  "ui:order": ["drawing_number","drawing_title","station_name","estimated_cost_lakhs","revision_number","remarks"]
}
$ui_schema$
);

-- ── 21. STATION_BUILDING_GAD ──────────────────────────────────────────────────
INSERT INTO form_definitions (
    id, activity_type_code, code, version, label,
    workflow_definition_id, section_codes, default_approver_designations,
    is_active, schema_json, ui_schema_json
) VALUES (
    'ffffffff-0006-0021-0001-000000000001',
    'DRAWING_APPROVAL', 'STATION_BUILDING_GAD_DRAWING_V1', 1, 'Station Building GAD Drawing v1',
    null, '{}', ARRAY['DY_CE_BRIDGE','SR_DEN','CE_PLANNING'], true,
    $schema$
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://pia.tracker/schemas/drawing/STATION_BUILDING_GAD_DRAWING_V1/1.json",
  "type": "object",
  "title": "Station Building GAD Drawing",
  "description": "General Arrangement Drawing for the station building.",
  "required": ["drawing_number","station_name"],
  "additionalProperties": false,
  "properties": {
    "drawing_number":        { "type": "string",  "title": "Drawing Number",         "minLength": 1, "maxLength": 64 },
    "drawing_title":         { "type": "string",  "title": "Drawing Title",          "maxLength": 256 },
    "station_name":          { "type": "string",  "title": "Station Name",           "minLength": 1, "maxLength": 256 },
    "building_type":         { "type": "string",  "title": "Building Type",
                               "enum": ["NEW","EXTENSION","MODIFICATION","OTHER"] },
    "total_floor_area_sqm":  { "type": "number",  "title": "Total Floor Area (sqm)", "minimum": 0 },
    "number_of_floors":      { "type": "integer", "title": "Number of Floors",       "minimum": 1 },
    "revision_number":       { "type": "integer", "title": "Revision Number",        "minimum": 0 },
    "remarks":               { "type": "string",  "title": "Remarks",               "maxLength": 2048 }
  }
}
$schema$,
    $ui_schema$
{
  "ui:order": ["drawing_number","drawing_title","station_name","building_type","total_floor_area_sqm","number_of_floors","revision_number","remarks"]
}
$ui_schema$
);

-- ── 22. FOB_GAD_TAD (Foot Over Bridge — GAD / Technical Approval Drawing) ─────
INSERT INTO form_definitions (
    id, activity_type_code, code, version, label,
    workflow_definition_id, section_codes, default_approver_designations,
    is_active, schema_json, ui_schema_json
) VALUES (
    'ffffffff-0006-0022-0001-000000000001',
    'DRAWING_APPROVAL', 'FOB_GAD_TAD_DRAWING_V1', 1, 'FOB GAD/TAD Drawing v1',
    null, '{}', ARRAY['DY_CE_BRIDGE','CBE','SR_DEN'], true,
    $schema$
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://pia.tracker/schemas/drawing/FOB_GAD_TAD_DRAWING_V1/1.json",
  "type": "object",
  "title": "FOB GAD/TAD Drawing",
  "description": "Foot Over Bridge General Arrangement / Technical Approval Drawing.",
  "required": ["drawing_number","station_name"],
  "additionalProperties": false,
  "properties": {
    "drawing_number":  { "type": "string",  "title": "Drawing Number",  "minLength": 1, "maxLength": 64 },
    "drawing_title":   { "type": "string",  "title": "Drawing Title",   "maxLength": 256 },
    "station_name":    { "type": "string",  "title": "Station Name",    "minLength": 1, "maxLength": 256 },
    "fob_span_m":      { "type": "number",  "title": "FOB Span (m)",    "minimum": 0 },
    "fob_width_m":     { "type": "number",  "title": "FOB Width (m)",   "minimum": 0 },
    "drawing_type":    { "type": "string",  "title": "Drawing Type",
                         "enum": ["GAD","TAD"] },
    "revision_number": { "type": "integer", "title": "Revision Number", "minimum": 0 },
    "remarks":         { "type": "string",  "title": "Remarks",         "maxLength": 2048 }
  }
}
$schema$,
    $ui_schema$
{
  "ui:order": ["drawing_number","drawing_title","station_name","drawing_type","fob_span_m","fob_width_m","revision_number","remarks"]
}
$ui_schema$
);

-- ── 23. TUNNEL_DESIGN ─────────────────────────────────────────────────────────
INSERT INTO form_definitions (
    id, activity_type_code, code, version, label,
    workflow_definition_id, section_codes, default_approver_designations,
    is_active, schema_json, ui_schema_json
) VALUES (
    'ffffffff-0006-0023-0001-000000000001',
    'DRAWING_APPROVAL', 'TUNNEL_DESIGN_DRAWING_V1', 1, 'Tunnel Design Drawing v1',
    null, '{}', ARRAY['DY_CE_DESIGN','SR_DEN','CE_PLANNING','PCE'], true,
    $schema$
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://pia.tracker/schemas/drawing/TUNNEL_DESIGN_DRAWING_V1/1.json",
  "type": "object",
  "title": "Tunnel Design Drawing",
  "description": "Tunnel design drawing including alignment, cross-section, and geotechnical parameters.",
  "required": ["drawing_number","chainage_from","chainage_to"],
  "additionalProperties": false,
  "properties": {
    "drawing_number":             { "type": "string",  "title": "Drawing Number",              "minLength": 1, "maxLength": 64 },
    "drawing_title":              { "type": "string",  "title": "Drawing Title",               "maxLength": 256 },
    "name_of_section":            { "type": "string",  "title": "Name of Section",             "maxLength": 256 },
    "chainage_from":              { "$ref": "#/$defs/Chainage", "title": "Chainage From" },
    "chainage_to":                { "$ref": "#/$defs/Chainage", "title": "Chainage To" },
    "length_m":                   { "type": "number",  "title": "Tunnel Length (m)",           "minimum": 0 },
    "tunnel_alignment_approved":  { "type": "boolean", "title": "Tunnel Alignment Approved" },
    "geotech_report_available":   { "type": "boolean", "title": "Geotechnical Report Available" },
    "gad_submitted":              { "type": "boolean", "title": "GAD Submitted" },
    "revision_number":            { "type": "integer", "title": "Revision Number",             "minimum": 0 },
    "remarks":                    { "type": "string",  "title": "Remarks",                     "maxLength": 2048 }
  },
  "$defs": { "Chainage": { "type": "string", "pattern": "^[0-9]+\\+[0-9]{3}$" } }
}
$schema$,
    $ui_schema$
{
  "ui:order": ["drawing_number","drawing_title","name_of_section","chainage_from","chainage_to","length_m","tunnel_alignment_approved","geotech_report_available","gad_submitted","revision_number","remarks"],
  "chainage_from": { "ui:widget": "chainage" },
  "chainage_to":   { "ui:widget": "chainage" }
}
$ui_schema$
);
