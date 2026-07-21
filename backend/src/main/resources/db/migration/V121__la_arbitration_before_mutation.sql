-- V121: Land Acquisition — move Arbitration before Mutation in section_codes
-- (was ...,section_20i,mutation,arbitration; now ...,section_20i,arbitration,mutation).
-- Drives the record edit page's section stepper directly, no frontend change needed.

UPDATE form_definitions
SET section_codes = ARRAY['acquisition_details','srp','cala','section_20a','jmr',
                           'section_20d','section_20e','section_20f_g','section_20h',
                           'section_20i','arbitration','mutation']
WHERE id = 'ffffffff-0001-0001-0001-000000000001';
