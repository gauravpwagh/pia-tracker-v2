-- V083__zones_add_rb.sql
-- Adds Railway Board (RB) as a zone for HQ/board-level users.

INSERT INTO zones (code, name, short_name, display_order, is_active)
VALUES ('RB', 'Railway Board', 'RB', 18, TRUE);
