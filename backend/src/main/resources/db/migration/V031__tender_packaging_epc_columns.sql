-- V031: Add EPC milestone boolean columns to tender_packaging_details.
--
-- The old estimated_value and tender_type columns are kept (no data loss) but
-- are no longer written or read by the application.  The two new columns
-- replace them as the key tracking fields for Tender Packaging activities.

ALTER TABLE tender_packaging_details
    ADD COLUMN IF NOT EXISTS epc_document_prepared BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS tender_finalized       BOOLEAN NOT NULL DEFAULT FALSE;
