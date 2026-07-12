-- V085__users_add_password_hash.sql
-- Adds a password hash for the fallback / standalone username+password login path
-- (used when SSO is unavailable). See AuthController.login / PasswordAuthService.
--
-- The column is nullable and starts NULL for every user. The INITIAL password is the
-- user's HRMS id (employee_id); the first successful password login hashes it (BCrypt)
-- and stores it here (lazy initialisation), so no bulk backfill / pgcrypto is needed.
-- Users can change it any time from the profile area, at which point this holds the
-- BCrypt hash of their chosen password.

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_updated_at TIMESTAMPTZ;
