package `in`.gov.ir.pia.security

import org.springframework.boot.context.properties.ConfigurationProperties

/**
 * Configuration for the cross-site SSO handoff (JWT) from the partner system.
 *
 * The partner mints a short-lived HS256 JWT (shared secret) and redirects the user to
 * `/api/v1/sso/callback`; PIA trusts only the signature, never the partner's cookies.
 * Claims: `sub` (Login ID / employee_id), `name`, `iat`, `exp`, plus `designation_code`
 * / `primary_zone_id` — the latter two are read by
 * [in.gov.ir.pia.service.auth.SsoProvisioningService] to auto-provision a user for an
 * unrecognized `sub`. See `sso-poc/INTEGRATION_SPEC.md` § 2.
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
