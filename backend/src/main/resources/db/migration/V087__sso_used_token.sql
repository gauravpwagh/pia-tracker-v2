-- V087: Replay-guard table for the cross-site SSO handoff (see security/SsoTokenVerifier.kt).
--
-- ABCDE's JWTs carry no `jti`, so a captured redirect URL (browser history, server
-- logs, proxy logs) could otherwise be replayed within the token's validity window.
-- We record a hash of every token we've successfully verified; a repeat hash is
-- rejected as a replay. expires_at lets a scheduled job prune rows once the token
-- itself would no longer be accepted anyway.

CREATE TABLE sso_used_token (
    token_hash varchar(64) PRIMARY KEY,   -- SHA-256 hex digest of the raw JWT
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ix_sso_used_token_expires_at ON sso_used_token (expires_at);

GRANT SELECT, INSERT, DELETE ON sso_used_token TO pia_app;
