package `in`.gov.ir.pia.security

import org.springframework.boot.context.properties.ConfigurationProperties

/**
 * Configuration for the cross-site SSO handoff (JWT) from the partner system.
 *
 * The partner mints a short-lived HS256 JWT (shared secret) and redirects the user to
 * `/api/v1/sso/callback`; PIA trusts only the signature, never the partner's cookies.
 * Claims are `sub` (Login ID / employee_id), `name`, `iat`, `exp` — nothing else today;
 * the partner may add claims (e.g. designation, zone) later without breaking this.
 */
@ConfigurationProperties(prefix = "pia.sso")
data class SsoProperties(
    /**
     * Shared HMAC secret. Must be overridden via PIA_SSO_SECRET outside dev — the
     * default here is a dev-only placeholder, never a real secret.
     */
    val secret: String = "dev-only-shared-secret-CHANGE-ME",
    /** Allowed clock skew between the partner and PIA, in seconds. */
    val clockSkewSeconds: Long = 60,
    /** Reject tokens whose lifetime (exp - iat) exceeds this, in seconds. Doc specifies 10 minutes. */
    val maxTokenLifetimeSeconds: Long = 600,
)
