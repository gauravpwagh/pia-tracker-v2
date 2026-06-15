-- V036: Update UTILITY_SHIFTING_V1 form schema.
--
-- Changes from V1:
--   * Replace free-text agency_name with executing_agency enum dropdown
--     (RAILWAY | USER_DEPT | OPEN_LINE | CONSTRUCTION)
--   * Add contractor_name and work_order_date (shown when agency != RAILWAY)

UPDATE form_definitions
SET
  schema_json = '{
  "type": "object",
  "title": "Utility Shifting Record",
  "description": "Per-utility shifting record. utility_type and executing_agency discriminate conditional fields.",
  "required": ["utility_type", "executing_agency", "location_description", "chainage_from", "chainage_to"],
  "additionalProperties": false,
  "properties": {
    "utility_type":         { "type": "string",  "title": "Utility Type",           "enum": ["OVERHEAD_LINE", "WATER_PIPELINE", "NALA", "TELECOM_CABLE", "GAS_PIPELINE"] },
    "executing_agency":     { "type": "string",  "title": "Executing Agency",       "enum": ["RAILWAY", "USER_DEPT", "OPEN_LINE", "CONSTRUCTION"] },
    "location_description": { "type": "string",  "title": "Location Description",   "minLength": 1, "maxLength": 512 },
    "chainage_from":        { "type": "string",  "title": "Chainage From",          "pattern": "^[0-9]+\\+[0-9]{3}$" },
    "chainage_to":          { "type": "string",  "title": "Chainage To",            "pattern": "^[0-9]+\\+[0-9]{3}$" },
    "work_order_no":        { "type": "string",  "title": "Work Order No.",         "maxLength": 128 },
    "work_order_date":      { "type": "string",  "title": "Work Order Date",        "format": "date" },
    "contractor_name":      { "type": "string",  "title": "Contractor Name",        "maxLength": 256 },
    "work_completed_on":    { "type": "string",  "title": "Work Completed On",      "format": "date" },
    "completion_cert_pdf":  { "type": "string",  "title": "Completion Certificate", "format": "uuid" },
    "pole_count":           { "type": "integer", "title": "No. of Poles",           "minimum": 0 },
    "span_length_m":        { "type": "number",  "title": "Span Length (m)",        "minimum": 0 },
    "pipe_diameter_mm":     { "type": "number",  "title": "Pipe Diameter (mm)",     "minimum": 0 },
    "length_m":             { "type": "number",  "title": "Length Shifted (m)",     "minimum": 0 },
    "nala_width_m":         { "type": "number",  "title": "Nala Width (m)",         "minimum": 0 },
    "nala_length_m":        { "type": "number",  "title": "Nala Length (m)",        "minimum": 0 },
    "revetment_type":       { "type": "string",  "title": "Revetment Type",         "maxLength": 128 },
    "cable_length_m":       { "type": "number",  "title": "Cable Length (m)",       "minimum": 0 },
    "cable_type":           { "type": "string",  "title": "Cable Type",             "maxLength": 128 },
    "remarks":              { "type": "string",  "title": "Remarks" }
  },
  "allOf": [
    {
      "if":   { "properties": { "utility_type": { "const": "OVERHEAD_LINE" } },  "required": ["utility_type"] },
      "then": { "required": ["pole_count"] }
    },
    {
      "if":   { "properties": { "utility_type": { "const": "WATER_PIPELINE" } }, "required": ["utility_type"] },
      "then": { "required": ["pipe_diameter_mm", "length_m"] }
    },
    {
      "if":   { "properties": { "utility_type": { "const": "NALA" } },           "required": ["utility_type"] },
      "then": { "required": ["nala_width_m", "nala_length_m"] }
    },
    {
      "if":   { "properties": { "utility_type": { "const": "TELECOM_CABLE" } },  "required": ["utility_type"] },
      "then": { "required": ["cable_length_m"] }
    },
    {
      "if":   { "properties": { "utility_type": { "const": "GAS_PIPELINE" } },   "required": ["utility_type"] },
      "then": { "required": ["pipe_diameter_mm", "length_m"] }
    }
  ]
}'::jsonb,
  ui_schema_json = '{
  "ui:order": [
    "utility_type",
    "executing_agency",
    "location_description",
    "chainage_from",
    "chainage_to",
    "work_order_no",
    "work_order_date",
    "contractor_name",
    "work_completed_on",
    "completion_cert_pdf",
    "pole_count",
    "span_length_m",
    "pipe_diameter_mm",
    "length_m",
    "nala_width_m",
    "nala_length_m",
    "revetment_type",
    "cable_length_m",
    "cable_type",
    "remarks"
  ],
  "utility_type": {
    "ui:widget": "select",
    "ui:enumNames": [
      "Overhead Line (OHT)",
      "Water Pipeline",
      "Nala / Drainage Channel",
      "Telecom / Fibre Cable",
      "Gas Pipeline"
    ]
  },
  "executing_agency": {
    "ui:widget": "select",
    "ui:enumNames": [
      "Railway (Construction)",
      "User Department",
      "Open Line",
      "Construction Organisation"
    ]
  },
  "location_description": { "ui:widget": "textarea" },
  "chainage_from":        { "ui:widget": "chainage" },
  "chainage_to":          { "ui:widget": "chainage" },
  "completion_cert_pdf":  { "ui:widget": "attachment" },
  "remarks":              { "ui:widget": "textarea" }
}'::jsonb
WHERE code = 'UTILITY_SHIFTING_V1';
