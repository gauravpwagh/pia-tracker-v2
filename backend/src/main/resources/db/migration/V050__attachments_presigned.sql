-- Presigned-URL upload: add scan states, SHA-256 integrity hash, multipart upload tracking.

ALTER TABLE attachments
    ADD COLUMN IF NOT EXISTS sha256             VARCHAR(64),
    ADD COLUMN IF NOT EXISTS multipart_upload_id VARCHAR(128);

-- Widen scan_status to cover new states: PENDING | SCANNING | CLEAN | INFECTED | SCAN_FAILED | EXEMPT
ALTER TABLE attachments
    ALTER COLUMN scan_status TYPE VARCHAR(16);

-- Back-fill existing rows: they were already scanned (legacy upload path), treat as CLEAN.
UPDATE attachments SET scan_status = 'CLEAN' WHERE scan_status NOT IN ('CLEAN','INFECTED','PENDING','SCANNING','SCAN_FAILED','EXEMPT');
