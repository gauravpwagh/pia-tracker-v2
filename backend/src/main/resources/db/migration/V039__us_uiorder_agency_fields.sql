-- V039: Move agency-conditional fields immediately below executing_agency in ui:order.

UPDATE form_definitions
SET ui_schema_json = ui_schema_json || jsonb_build_object(
  'ui:order', jsonb_build_array(
    'utility_type',
    'executing_agency',
    'estimate_position',
    'fund_submission',
    'fund_submission_by_construction',
    'material_available',
    'agency_available',
    'contractor_name',
    'work_order_date',
    'location_description',
    'chainage_from',
    'chainage_to',
    'work_order_no',
    'work_completed_on',
    'completion_cert_pdf',
    'pole_count',
    'span_length_m',
    'pipe_diameter_mm',
    'length_m',
    'nala_width_m',
    'nala_length_m',
    'revetment_type',
    'cable_length_m',
    'cable_type',
    'remarks'
  )
)
WHERE code = 'UTILITY_SHIFTING_V1';
