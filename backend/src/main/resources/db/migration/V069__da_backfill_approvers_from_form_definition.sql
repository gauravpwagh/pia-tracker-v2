-- V069: Backfill drawing_approvers for all existing DRAWING_APPROVAL records.
--
-- V062/V068 updated default_approver_designations in form_definitions but that
-- only affects newly created records. Existing records still have whatever
-- approvers were seeded at creation time (wrong or incomplete).
--
-- This migration wipes all existing drawing_approvers rows for every
-- DRAWING_APPROVAL activity record and re-seeds them from the current
-- default_approver_designations on the matching form_definition.
-- Any previously entered approved_on dates and remarks are intentionally lost.

-- Step 1: Delete all existing approver slots for DRAWING_APPROVAL records.
DELETE FROM drawing_approvers
WHERE activity_record_id IN (
    SELECT ar.id
    FROM activity_records ar
    JOIN form_definitions fd ON fd.id = ar.form_definition_id
    WHERE fd.activity_type_code = 'DRAWING_APPROVAL'
);

-- Step 2: Re-seed from form_definitions.default_approver_designations.
-- For each record, unnest the designation array with ordinality to derive position.
INSERT INTO drawing_approvers (
    id,
    activity_record_id,
    approval_designation_code,
    position,
    approved_on,
    remarks,
    created_at,
    updated_at
)
SELECT
    gen_random_uuid(),
    ar.id,
    desig.code,
    (desig.pos - 1),   -- 0-based position
    NULL,
    NULL,
    NOW(),
    NOW()
FROM activity_records ar
JOIN form_definitions fd ON fd.id = ar.form_definition_id
CROSS JOIN LATERAL unnest(fd.default_approver_designations) WITH ORDINALITY AS desig(code, pos)
WHERE fd.activity_type_code = 'DRAWING_APPROVAL'
  AND fd.default_approver_designations IS NOT NULL
  AND array_length(fd.default_approver_designations, 1) > 0;
