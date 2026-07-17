-- V094: "Create" (finalize) a Sub Division/Taluka to lock it against further edits.
--
-- Once finalized, a taluka's SRP/CALA fields and name can no longer be edited
-- or deleted (enforced in ActivityService.updateTaluka/deleteTaluka) — only
-- "Save Draft" keeps it editable.

ALTER TABLE activity_taluka_details
    ADD COLUMN is_finalized BOOLEAN NOT NULL DEFAULT false;
