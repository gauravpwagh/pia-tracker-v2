-- ============================================================================
-- Duplicate-activity cleanup — STEP 2 of 2: APPLY (transactional, idempotent)
-- ============================================================================
-- Run 01_report.sql FIRST and confirm the KEEP/MERGE plan looks right.
--
-- Rule enforced: at most ONE non-deleted activity of each type per project
-- (the name is irrelevant — two activities of the same type are never allowed).
--
-- This script, in ONE transaction:
--   1. Reassigns every non-deleted record from each duplicate ("loser") activity
--      of a type into its keeper (most records; ties → earliest created_at → id).
--   2. Soft-deletes the now-empty loser activities (is_deleted = true).
--   3. Creates a partial UNIQUE INDEX on (project_id, activity_type_code) so a
--      second activity of a type can never be created again — no matter what
--      (races, double-submits, two tabs / two users, direct SQL all bounce off it).
--
-- Safe to re-run: after the first run there are no duplicate groups left, so
-- steps 1-2 touch nothing, and the index uses IF NOT EXISTS.
--
-- Merges are strictly per-project (grouping includes project_id) — records are
-- never moved between different projects.
--
-- NOTE: This is a one-off operational cleanup. It does NOT write audit_log rows
-- (the append-only audit trigger is left untouched); the record of this change
-- is this script plus its run output.
--
-- How to run on the VM (rootful Podman, postgres container is `pia-postgres`):
--   sudo podman exec -i pia-postgres psql -U pia -d pia < 02_apply.sql
-- ============================================================================

BEGIN;

-- Loser -> keeper mapping for every duplicate group (one group per project+type).
CREATE TEMP TABLE _dup_map ON COMMIT DROP AS
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
        ROW_NUMBER() OVER (
            PARTITION BY pa.project_id, pa.activity_type_code
            ORDER BY COALESCE(rc.record_count, 0) DESC, pa.created_at ASC, pa.id ASC
        ) AS rn
    FROM project_activities pa
    LEFT JOIN rc ON rc.project_activity_id = pa.id
    WHERE pa.is_deleted = false
),
keepers AS (
    SELECT project_id, activity_type_code, id AS keeper_id
    FROM ranked
    WHERE rn = 1
)
SELECT r.id AS loser_id, k.keeper_id
FROM ranked r
JOIN keepers k
    ON  k.project_id         = r.project_id
    AND k.activity_type_code = r.activity_type_code
WHERE r.rn > 1;

-- Show what is about to be moved (row count of the mapping).
SELECT count(*) AS loser_activities_to_merge FROM _dup_map;

-- 1) Fold every non-deleted record from each loser into its keeper.
UPDATE activity_records ar
SET project_activity_id = m.keeper_id
FROM _dup_map m
WHERE ar.project_activity_id = m.loser_id
  AND ar.is_deleted = false;

-- 2) Soft-delete the emptied-out loser activities.
--    deleted_by_user_id is left NULL (no application principal in a direct script).
UPDATE project_activities pa
SET is_deleted = true,
    deleted_at = now(),
    version    = version + 1
FROM _dup_map m
WHERE pa.id = m.loser_id
  AND pa.is_deleted = false;

-- 3) Permanent backstop: one non-deleted activity per (project, type).
CREATE UNIQUE INDEX IF NOT EXISTS ux_pact_project_type
    ON project_activities (project_id, activity_type_code)
    WHERE NOT is_deleted;

COMMIT;

-- Post-check: this MUST return zero rows if the cleanup fully succeeded.
SELECT pa.project_id, pa.activity_type_code, COUNT(*) AS remaining_dupes
FROM project_activities pa
WHERE pa.is_deleted = false
GROUP BY pa.project_id, pa.activity_type_code
HAVING COUNT(*) > 1;
