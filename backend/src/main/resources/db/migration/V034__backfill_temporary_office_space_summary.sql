-- V034: Seed project_activity_summary for existing TEMPORARY_OFFICE_SPACE activities.
--
-- Mirrors V032 (Tender Packaging).  Prior to this fix, TOS activities were never
-- counted because they have no child activity_records and ActivityRecordCreatedEvent
-- was only fired for TENDER_PACKAGING.

INSERT INTO project_activity_summary
    (project_id, activity_type_code,
     draft_count, submitted_count, verified_count,
     authenticated_count, sent_back_count, total_records,
     sla_breach_count, updated_at)
SELECT
    pa.project_id,
    'TEMPORARY_OFFICE_SPACE',
    COUNT(*) FILTER (WHERE pa.status = 'DRAFT')                                          AS draft_count,
    COUNT(*) FILTER (WHERE pa.status = 'SUBMITTED_FOR_VERIFICATION')                     AS submitted_count,
    COUNT(*) FILTER (WHERE pa.status = 'VERIFIED')                                       AS verified_count,
    COUNT(*) FILTER (WHERE pa.status = 'AUTHENTICATED')                                  AS authenticated_count,
    COUNT(*) FILTER (WHERE pa.status IN ('SENT_BACK_TO_DYCE', 'SENT_BACK_TO_NODAL'))    AS sent_back_count,
    COUNT(*)                                                                              AS total_records,
    0                                                                                     AS sla_breach_count,
    now()                                                                                 AS updated_at
FROM project_activities pa
WHERE pa.activity_type_code = 'TEMPORARY_OFFICE_SPACE'
  AND NOT pa.is_deleted
GROUP BY pa.project_id
ON CONFLICT (project_id, activity_type_code) DO UPDATE
    SET draft_count         = EXCLUDED.draft_count,
        submitted_count     = EXCLUDED.submitted_count,
        verified_count      = EXCLUDED.verified_count,
        authenticated_count = EXCLUDED.authenticated_count,
        sent_back_count     = EXCLUDED.sent_back_count,
        total_records       = EXCLUDED.total_records,
        updated_at          = now();
