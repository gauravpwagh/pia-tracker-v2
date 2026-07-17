-- ============================================================================
-- Duplicate-activity cleanup — STEP 1 of 2: REPORT (read-only, safe to re-run)
-- ============================================================================
-- Purpose: show every group of duplicate activities BEFORE anything is changed,
-- so you can eyeball which activity will be KEPT and which will be MERGED away.
--
-- Rule: a project may hold at most ONE non-deleted activity of each type. So a
-- "duplicate group" = more than one NON-deleted activity on the SAME project
-- with the SAME activity_type_code (the NAME does not matter — two activities
-- of the same type are never allowed, whatever they are called).
--
-- Keeper rule: within each group, KEEP the activity with the MOST non-deleted
-- records; ties broken by earliest created_at, then id (fully deterministic).
-- Grouping always includes project_id, so activities are NEVER merged across
-- different projects.
--
-- ⚠ Look at the `name` column in the output: if a group lists two MEANINGFUL,
--   DIFFERENT names that are both really in use, merging will keep only the
--   keeper's name (and its scope docs) and fold the other's records in. For the
--   accidental same-named duplicates this is exactly right; if you see a real
--   different-named pair, pause before applying step 2 for that project.
--
-- How to run on the VM (rootful Podman, postgres container is `pia-postgres`):
--   sudo podman exec -i pia-postgres psql -U pia -d pia < 01_report.sql
-- ============================================================================

WITH rc AS (
    SELECT project_activity_id, COUNT(*) AS record_count
    FROM activity_records
    WHERE is_deleted = false
    GROUP BY project_activity_id
),
ranked AS (
    SELECT
        pa.id,
        pa.project_id,
        pa.activity_type_code,
        pa.name,
        COALESCE(rc.record_count, 0) AS record_count,
        pa.created_at,
        ROW_NUMBER() OVER (
            PARTITION BY pa.project_id, pa.activity_type_code
            ORDER BY COALESCE(rc.record_count, 0) DESC, pa.created_at ASC, pa.id ASC
        ) AS rn,
        COUNT(*) OVER (
            PARTITION BY pa.project_id, pa.activity_type_code
        ) AS group_size
    FROM project_activities pa
    LEFT JOIN rc ON rc.project_activity_id = pa.id
    WHERE pa.is_deleted = false
)
SELECT
    project_id,
    activity_type_code,
    name,
    id AS activity_id,
    record_count,
    created_at,
    CASE WHEN rn = 1 THEN 'KEEP' ELSE 'MERGE INTO KEEPER' END AS action
FROM ranked
WHERE group_size > 1
ORDER BY project_id, activity_type_code, rn;

-- If this returns zero rows, there are no duplicates and step 2 is a no-op
-- (it will still create the unique index that prevents them going forward).
