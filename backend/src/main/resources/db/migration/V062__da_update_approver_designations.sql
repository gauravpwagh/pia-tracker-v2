-- V062: Update drawing approval form approver designations to match auth matrix xlsx.

-- ESP
UPDATE form_definitions SET default_approver_designations =
  ARRAY['DY_CE','DY_CEE','DY_CSTE','SR_DEN','SR_DEN_CO','SR_DOM','SR_DEE_TRD','SR_DSTE','SR_DCM','ADRM','DRM','CE_C','CTPM','CSTE_CON','CE_PLANNING']
WHERE code = 'ESP_DRAWING_V1';

-- SIP
UPDATE form_definitions SET default_approver_designations =
  ARRAY['DY_CSTE','SR_DOM','SR_DSTE','CSTE_CON','CTPM','CSTE_OL']
WHERE code = 'SIP_DRAWING_V1';

-- ST/LT (TOC)
UPDATE form_definitions SET default_approver_designations =
  ARRAY['DY_CSTE','SR_DOM','SR_DSTE','CSTE_CON','CTPM','CSTE_OL']
WHERE code = 'ST_LT_TOC_DRAWING_V1';

-- SWRD
UPDATE form_definitions SET default_approver_designations =
  ARRAY['DY_CSTE','SR_DOM','SR_DSTE','CSTE_CON','CTPM','CSTE_OL']
WHERE code = 'SWRD_DRAWING_V1';

-- SWR
UPDATE form_definitions SET default_approver_designations =
  ARRAY['DY_CSTE','SR_DOM','SR_DSTE','CSTE_CON','CTPM','CSTE_OL']
WHERE code = 'SWR_DRAWING_V1';

-- FAT
UPDATE form_definitions SET default_approver_designations =
  ARRAY['DY_CSTE','SR_DOM','SR_DSTE','CSTE_CON','CTPM','CSTE_OL']
WHERE code = 'FAT_DRAWING_V1';

-- SAT
UPDATE form_definitions SET default_approver_designations =
  ARRAY['DY_CSTE','SR_DOM','SR_DSTE','CSTE_CON','CTPM','CSTE_OL']
WHERE code = 'SAT_DRAWING_V1';

-- Mini Diagram / RSP
UPDATE form_definitions SET default_approver_designations =
  ARRAY['DY_CSTE','CSTE_CON']
WHERE code = 'RSP_DRAWING_V1';

-- CRP Cable Route Plan
UPDATE form_definitions SET default_approver_designations =
  ARRAY['DY_CSTE','SR_DSTE']
WHERE code = 'CABLE_ROUTE_PLAN_DRAWING_V1';

-- LOP
UPDATE form_definitions SET default_approver_designations =
  ARRAY['DY_CEE','SR_DOM','SR_DEE_TRD','CEE_CON','PCEE']
WHERE code = 'LOP_DRAWING_V1';

-- Project Sheet
UPDATE form_definitions SET default_approver_designations =
  ARRAY['DY_CE','SR_DEN','SR_DEN_CO','DY_CE_PLANNING','CE_C','CE_PLANNING']
WHERE code = 'PROJECT_SHEET_DRAWING_V1';

-- GAD Mega / Major / Minor
UPDATE form_definitions SET default_approver_designations =
  ARRAY['DY_CE','SR_DEN','SR_DEN_CO','DY_CE_DESIGN','CE_C','DY_CE_BRIDGE','CBE']
WHERE code IN ('GAD_MEGA_DRAWING_V1','GAD_MAJOR_DRAWING_V1','GAD_MINOR_DRAWING_V1');

-- LWR Plan
UPDATE form_definitions SET default_approver_designations =
  ARRAY['DY_CE','SR_DEN','SR_DEN_CO','DY_CE_PLANNING','CE_C','DY_CE_TRACK','CTE']
WHERE code = 'LWR_PLAN_DRAWING_V1';

-- Grade Condonation / Minor Sanction Bridge / Dispensation of Yard /
-- Minor Sanction of Yard / Station Building GAD / FOB
UPDATE form_definitions SET default_approver_designations =
  ARRAY['DY_CE','DY_CSTE','DY_CEE','SR_DEN','SR_DEN_CO','SR_DOM','SR_DCM','SR_DSTE',
        'DRM','DY_CE_PLANNING','CE_C','CE_PLANNING','DY_CE_BRIDGE','CBE']
WHERE code IN (
  'GRADE_CONDONATION_DRAWING_V1',
  'BRIDGE_MINOR_SANCTION_DRAWING_V1',
  'YARD_DISPENSATION_DRAWING_V1',
  'YARD_MINOR_SANCTION_DRAWING_V1',
  'STATION_BUILDING_GAD_DRAWING_V1',
  'FOB_GAD_TAD_DRAWING_V1'
);
