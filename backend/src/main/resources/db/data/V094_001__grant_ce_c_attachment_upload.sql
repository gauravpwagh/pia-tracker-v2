-- V094_001: CE/C can already fully manage Sub Division/Taluka rows (create, edit,
-- delete, finalize — see requireDyceAssignment's CE_C carve-out in ActivityService),
-- but couldn't upload the SRP/CALA gazette PDFs for one, since ATTACHMENT.UPLOAD.OWN_RECORDS
-- was previously DY_CE_C/NODAL_DY_CE_C only. Grant it to CE_C too.
--
-- Side effect (intentional, not just incidental): this is the same permission code
-- used by the Land Acquisition Scope checklist uploads (KMZ/SRP notification/CALA
-- nomination), so CE/C gains upload there too — previously flagged as a known gap
-- in HANDOVER.md ("CE cannot upload LA scope docs... Not requested — only change if
-- asked"), now explicitly requested via the taluka gazette PDF workflow.

INSERT INTO role_permissions (role_code, permission_code)
VALUES ('ROLE_CE_C', 'ATTACHMENT.UPLOAD.OWN_RECORDS')
ON CONFLICT DO NOTHING;
