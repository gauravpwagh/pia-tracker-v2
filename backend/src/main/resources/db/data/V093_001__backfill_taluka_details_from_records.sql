-- V093_001: Seed activity_taluka_details from existing Land Acquisition records.
--
-- Before this change, `sub_division_taluka` and the SRP/CALA gazette fields
-- were entered per-record. This migration creates one taluka master row per
-- distinct (activity, sub_division_taluka) pair already in use, backfilling
-- the date/number fields from whatever records already have.
--
-- Conflict rule: if two records under the same taluka disagree on a given
-- SRP/CALA field, that field is left NULL on the master row (rather than
-- silently picking one) — a human should reconcile it in the Sub division/
-- taluka panel. Fields where every record agrees (or only one has a value)
-- are backfilled automatically.
--
-- Gazette PDFs are NOT backfilled here: they were previously attached to the
-- record itself (entityType ACTIVITY_RECORD), not to a taluka row, and this
-- migration has no way to know which record's PDF should "win" for a shared
-- taluka. Existing per-record gazette PDFs are left in place (still visible
-- on that record's Attachments panel); re-upload the gazette PDF once under
-- the new Sub division/taluka panel per taluka going forward.
--
-- created_by_user_id has no real principal in a data migration — the
-- activity's own primary_dyce_user_id is used as the closest reasonable owner.

WITH la_records AS (
    SELECT
        ar.project_activity_id,
        pa.primary_dyce_user_id,
        trim(ar.data_json #>> '{acquisition_details,sub_division_taluka}') AS taluka_name,
        ar.data_json #>> '{srp,srp_declared_in_gaz_on}'                AS srp_declared_in_gaz_on,
        ar.data_json #>> '{srp,srp_gazette,published_on}'              AS srp_gazette_published_on,
        ar.data_json #>> '{srp,srp_gazette,gaz_number}'                AS srp_gazette_number,
        ar.data_json #>> '{cala,cala_received_from_state_on}'          AS cala_received_from_state_on,
        ar.data_json #>> '{cala,cala_publication_in_gaz,published_on}' AS cala_gazette_published_on,
        ar.data_json #>> '{cala,cala_publication_in_gaz,gaz_number}'   AS cala_gazette_number
    FROM activity_records ar
    JOIN project_activities pa ON pa.id = ar.project_activity_id
    WHERE pa.activity_type_code = 'LAND_ACQUISITION'
      AND ar.is_deleted = false
      AND pa.is_deleted = false
      AND coalesce(trim(ar.data_json #>> '{acquisition_details,sub_division_taluka}'), '') <> ''
),
agreed AS (
    SELECT
        project_activity_id,
        lower(taluka_name)         AS taluka_key,
        max(taluka_name)           AS taluka_name,
        (array_agg(primary_dyce_user_id))[1] AS primary_dyce_user_id,
        CASE WHEN count(DISTINCT srp_declared_in_gaz_on) FILTER (WHERE srp_declared_in_gaz_on IS NOT NULL) <= 1
             THEN max(srp_declared_in_gaz_on) END AS srp_declared_in_gaz_on,
        CASE WHEN count(DISTINCT srp_gazette_published_on) FILTER (WHERE srp_gazette_published_on IS NOT NULL) <= 1
             THEN max(srp_gazette_published_on) END AS srp_gazette_published_on,
        CASE WHEN count(DISTINCT srp_gazette_number) FILTER (WHERE srp_gazette_number IS NOT NULL) <= 1
             THEN max(srp_gazette_number) END AS srp_gazette_number,
        CASE WHEN count(DISTINCT cala_received_from_state_on) FILTER (WHERE cala_received_from_state_on IS NOT NULL) <= 1
             THEN max(cala_received_from_state_on) END AS cala_received_from_state_on,
        CASE WHEN count(DISTINCT cala_gazette_published_on) FILTER (WHERE cala_gazette_published_on IS NOT NULL) <= 1
             THEN max(cala_gazette_published_on) END AS cala_gazette_published_on,
        CASE WHEN count(DISTINCT cala_gazette_number) FILTER (WHERE cala_gazette_number IS NOT NULL) <= 1
             THEN max(cala_gazette_number) END AS cala_gazette_number
    FROM la_records
    GROUP BY project_activity_id, lower(taluka_name)
)
INSERT INTO activity_taluka_details (
    project_activity_id, taluka_name,
    srp_declared_in_gaz_on, srp_gazette_published_on, srp_gazette_number,
    cala_received_from_state_on, cala_gazette_published_on, cala_gazette_number,
    created_by_user_id
)
SELECT
    project_activity_id, taluka_name,
    srp_declared_in_gaz_on::date, srp_gazette_published_on::date, srp_gazette_number,
    cala_received_from_state_on::date, cala_gazette_published_on::date, cala_gazette_number,
    primary_dyce_user_id
FROM agreed
ON CONFLICT DO NOTHING;
