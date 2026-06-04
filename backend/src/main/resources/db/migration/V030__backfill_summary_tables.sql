-- V030: Backfill summary tables from existing activity_records.
--
-- Prior to the ActivityRecordCreatedEvent fix (fe513c0), newly created records
-- did not seed project_activity_summary.  This migration does a full recompute
-- from activity_records so that all pre-existing records become visible on the
-- dashboard.
--
-- Safe to re-run: every INSERT uses ON CONFLICT DO UPDATE (full replacement).
-- Cascade order: activity_summary → project_summary → zone_summary → pan_india_summary.

-- ── 1. project_activity_summary ─────────────────────────────────────────────

INSERT INTO project_activity_summary
    (project_id, activity_type_code,
     draft_count, submitted_count, verified_count,
     authenticated_count, sent_back_count, total_records,
     sla_breach_count, updated_at)
SELECT
    pa.project_id,
    pa.activity_type_code,
    COUNT(*) FILTER (WHERE ar.record_state = 'DRAFT')                                             AS draft_count,
    COUNT(*) FILTER (WHERE ar.record_state = 'SUBMITTED_FOR_VERIFICATION')                        AS submitted_count,
    COUNT(*) FILTER (WHERE ar.record_state = 'VERIFIED')                                          AS verified_count,
    COUNT(*) FILTER (WHERE ar.record_state = 'AUTHENTICATED')                                     AS authenticated_count,
    COUNT(*) FILTER (WHERE ar.record_state IN ('SENT_BACK_TO_DYCE', 'SENT_BACK_TO_NODAL'))       AS sent_back_count,
    COUNT(*)                                                                                       AS total_records,
    -- sla_breach_count: records whose current workflow state has exceeded sla_days
    (
        SELECT COUNT(*)
        FROM workflow_instances wi
        JOIN workflow_states    ws ON ws.id = wi.current_state_id
        JOIN activity_records   ar2 ON ar2.id = wi.entity_id AND NOT ar2.is_deleted
        JOIN project_activities pa2 ON pa2.id = ar2.project_activity_id
        WHERE pa2.project_id         = pa.project_id
          AND pa2.activity_type_code = pa.activity_type_code
          AND ws.sla_days IS NOT NULL
          AND ws.is_terminal = false
          AND EXTRACT(EPOCH FROM (now() - wi.entered_state_at)) > ws.sla_days * 86400.0
    )                                                                                              AS sla_breach_count,
    now()                                                                                          AS updated_at
FROM activity_records   ar
JOIN project_activities pa ON pa.id = ar.project_activity_id
WHERE NOT ar.is_deleted
  AND NOT pa.is_deleted
GROUP BY pa.project_id, pa.activity_type_code
ON CONFLICT (project_id, activity_type_code) DO UPDATE
    SET draft_count          = EXCLUDED.draft_count,
        submitted_count      = EXCLUDED.submitted_count,
        verified_count       = EXCLUDED.verified_count,
        authenticated_count  = EXCLUDED.authenticated_count,
        sent_back_count      = EXCLUDED.sent_back_count,
        total_records        = EXCLUDED.total_records,
        sla_breach_count     = EXCLUDED.sla_breach_count,
        updated_at           = now();

-- ── 2. project_utility_subtype_summary ──────────────────────────────────────

INSERT INTO project_utility_subtype_summary
    (project_id, record_subtype,
     draft_count, submitted_count, verified_count,
     authenticated_count, sent_back_count, total_records,
     updated_at)
SELECT
    pa.project_id,
    ar.record_subtype,
    COUNT(*) FILTER (WHERE ar.record_state = 'DRAFT')                                             AS draft_count,
    COUNT(*) FILTER (WHERE ar.record_state = 'SUBMITTED_FOR_VERIFICATION')                        AS submitted_count,
    COUNT(*) FILTER (WHERE ar.record_state = 'VERIFIED')                                          AS verified_count,
    COUNT(*) FILTER (WHERE ar.record_state = 'AUTHENTICATED')                                     AS authenticated_count,
    COUNT(*) FILTER (WHERE ar.record_state IN ('SENT_BACK_TO_DYCE', 'SENT_BACK_TO_NODAL'))       AS sent_back_count,
    COUNT(*)                                                                                       AS total_records,
    now()                                                                                          AS updated_at
FROM activity_records   ar
JOIN project_activities pa ON pa.id = ar.project_activity_id
WHERE NOT ar.is_deleted
  AND NOT pa.is_deleted
  AND pa.activity_type_code = 'UTILITY_SHIFTING'
  AND ar.record_subtype IS NOT NULL
GROUP BY pa.project_id, ar.record_subtype
ON CONFLICT (project_id, record_subtype) DO UPDATE
    SET draft_count         = EXCLUDED.draft_count,
        submitted_count     = EXCLUDED.submitted_count,
        verified_count      = EXCLUDED.verified_count,
        authenticated_count = EXCLUDED.authenticated_count,
        sent_back_count     = EXCLUDED.sent_back_count,
        total_records       = EXCLUDED.total_records,
        updated_at          = now();

-- ── 3. project_forest_stage_summary ─────────────────────────────────────────

INSERT INTO project_forest_stage_summary
    (project_id, stage_code,
     draft_count, submitted_count, verified_count,
     authenticated_count, sent_back_count, total_records,
     updated_at)
SELECT
    pa.project_id,
    wi.section_code                                                                                AS stage_code,
    COUNT(*) FILTER (WHERE ws.code = 'DRAFT')                                                     AS draft_count,
    COUNT(*) FILTER (WHERE ws.code = 'SUBMITTED_FOR_VERIFICATION')                                AS submitted_count,
    COUNT(*) FILTER (WHERE ws.code = 'VERIFIED')                                                  AS verified_count,
    COUNT(*) FILTER (WHERE ws.code = 'AUTHENTICATED')                                             AS authenticated_count,
    COUNT(*) FILTER (WHERE ws.code IN ('SENT_BACK_TO_DYCE', 'SENT_BACK_TO_NODAL'))               AS sent_back_count,
    COUNT(*)                                                                                       AS total_records,
    now()                                                                                          AS updated_at
FROM workflow_instances wi
JOIN workflow_states    ws  ON ws.id = wi.current_state_id
JOIN activity_records   ar  ON ar.id = wi.entity_id   AND NOT ar.is_deleted
JOIN project_activities pa  ON pa.id = ar.project_activity_id AND NOT pa.is_deleted
WHERE pa.activity_type_code = 'FOREST_CLEARANCE'
  AND wi.section_code IS NOT NULL
  AND wi.entity_type = 'ACTIVITY_RECORD'
GROUP BY pa.project_id, wi.section_code
ON CONFLICT (project_id, stage_code) DO UPDATE
    SET draft_count         = EXCLUDED.draft_count,
        submitted_count     = EXCLUDED.submitted_count,
        verified_count      = EXCLUDED.verified_count,
        authenticated_count = EXCLUDED.authenticated_count,
        sent_back_count     = EXCLUDED.sent_back_count,
        total_records       = EXCLUDED.total_records,
        updated_at          = now();

-- ── 4. project_summary ───────────────────────────────────────────────────────

INSERT INTO project_summary
    (project_id, total_records, authenticated_count, drawings_in_approval, sla_breach_count)
SELECT
    p.id                                              AS project_id,
    COALESCE(SUM(pas.total_records),      0)          AS total_records,
    COALESCE(SUM(pas.authenticated_count),0)          AS authenticated_count,
    (
        SELECT COUNT(*)
        FROM activity_records ar2
        JOIN project_activities pa2 ON pa2.id = ar2.project_activity_id
        WHERE pa2.project_id          = p.id
          AND pa2.activity_type_code  = 'DRAWING_APPROVAL'
          AND ar2.record_state NOT IN ('AUTHENTICATED', 'DRAFT')
          AND NOT ar2.is_deleted
    )                                                 AS drawings_in_approval,
    COALESCE(SUM(pas.sla_breach_count),   0)          AS sla_breach_count
FROM projects p
LEFT JOIN project_activity_summary pas ON pas.project_id = p.id
WHERE NOT p.is_deleted
GROUP BY p.id
ON CONFLICT (project_id) DO UPDATE
    SET total_records        = EXCLUDED.total_records,
        authenticated_count  = EXCLUDED.authenticated_count,
        drawings_in_approval = EXCLUDED.drawings_in_approval,
        sla_breach_count     = EXCLUDED.sla_breach_count;

-- ── 5. zone_summary ──────────────────────────────────────────────────────────

INSERT INTO zone_summary
    (zone_id, projects_active, projects_with_sla_breaches, total_drawings_in_approval)
SELECT
    z.id                                                                  AS zone_id,
    COUNT(p.id) FILTER (WHERE p.lifecycle_state NOT IN ('COMPLETED', 'DROPPED', 'CANCELLED')) AS projects_active,
    COUNT(ps.project_id) FILTER (WHERE ps.sla_breach_count > 0)         AS projects_with_sla_breaches,
    COALESCE(SUM(ps.drawings_in_approval), 0)                            AS total_drawings_in_approval
FROM zones z
LEFT JOIN projects p  ON p.zone_id  = z.id AND NOT p.is_deleted
LEFT JOIN project_summary ps ON ps.project_id = p.id
WHERE z.is_active
GROUP BY z.id
ON CONFLICT (zone_id) DO UPDATE
    SET projects_active            = EXCLUDED.projects_active,
        projects_with_sla_breaches = EXCLUDED.projects_with_sla_breaches,
        total_drawings_in_approval = EXCLUDED.total_drawings_in_approval;

-- ── 6. pan_india_summary ─────────────────────────────────────────────────────

INSERT INTO pan_india_summary
    (singleton, total_projects_active, total_projects_with_sla_breaches, total_drawings_in_approval)
SELECT
    true,
    COALESCE(SUM(projects_active),            0),
    COALESCE(SUM(projects_with_sla_breaches), 0),
    COALESCE(SUM(total_drawings_in_approval), 0)
FROM zone_summary
ON CONFLICT (singleton) DO UPDATE
    SET total_projects_active            = EXCLUDED.total_projects_active,
        total_projects_with_sla_breaches = EXCLUDED.total_projects_with_sla_breaches,
        total_drawings_in_approval       = EXCLUDED.total_drawings_in_approval;
