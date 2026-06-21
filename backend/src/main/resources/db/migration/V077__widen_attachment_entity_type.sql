-- V077: Widen attachments.entity_type from VARCHAR(32) to VARCHAR(128)
-- to accommodate scoped entity types like ACTIVITY_RECORD__forest_area_statement.

ALTER TABLE attachments ALTER COLUMN entity_type TYPE character varying(128);
