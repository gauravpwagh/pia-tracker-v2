-- V068: Fix approver lists for 8 DA form definitions.
-- (1) Grade Condonation group (6 forms): add DY_CE_C — "dyce/c/planning" in the
--     xlsx means two designations (DY_CE_C + DY_CE_PLANNING); V062 only set DY_CE_PLANNING.
-- (2) CURVE_DETAILS and TUNNEL_DESIGN (2 forms): set approvers for the first time
--     (same authority list as the Grade Condonation group per user confirmation).

UPDATE form_definitions
SET default_approver_designations =
  ARRAY['DY_CE','DY_CSTE','DY_CEE','SR_DEN','SR_DEN_CO','SR_DOM','SR_DCM','SR_DSTE',
        'DRM','DY_CE_C','DY_CE_PLANNING','CE_C','CE_PLANNING','DY_CE_BRIDGE','CBE']
WHERE code IN (
  'GRADE_CONDONATION_DRAWING_V1',
  'BRIDGE_MINOR_SANCTION_DRAWING_V1',
  'YARD_DISPENSATION_DRAWING_V1',
  'YARD_MINOR_SANCTION_DRAWING_V1',
  'STATION_BUILDING_GAD_DRAWING_V1',
  'FOB_GAD_TAD_DRAWING_V1',
  'CURVE_DETAILS_DRAWING_V1',
  'TUNNEL_DESIGN_DRAWING_V1'
);
