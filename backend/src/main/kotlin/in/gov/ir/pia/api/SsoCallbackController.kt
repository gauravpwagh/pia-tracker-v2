package `in`.gov.ir.pia.api

import `in`.gov.ir.pia.repository.UserRepository
import `in`.gov.ir.pia.security.DummyAuthFilter.Companion.SESSION_USER_ID_KEY
import `in`.gov.ir.pia.security.SsoProperties
import `in`.gov.ir.pia.security.SsoTokenVerifier
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.slf4j.LoggerFactory
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Profile
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

/**
 * Cross-site SSO handoff landing endpoint. See `sso-poc/INTEGRATION_SPEC.md` for the
 * partner-side contract (subject to the HS256 claim set actually implemented — see
 * [SsoProperties] and [SsoTokenVerifier]).
 *
 * The partner system mints a short-lived HS256 JWT and 302-redirects the user here.
 * We verify the token (never the partner's cookies), map `sub` (Login ID / employee_id)
 * to a PIA user, set the same session attribute [DummyAuthFilter] reads, and redirect
 * into the SPA — where the user is already authenticated. Roles/zones/permissions then
 * resolve exactly as they do for normal login.
 *
 * Deny-by-default: users must already be provisioned in PIA (via CSV import — see
 * `scripts/import_users_abcde.py`) to bridge in. No auto-provisioning from the token.
 *
 * Gated to dev/beta for now (mirrors [AuthController]); production swaps this to a
 * prod-safe profile once the real partner endpoint and shared secret are live.
 */
@RestController
@Profile("dev", "beta")
@EnableConfigurationProperties(SsoProperties::class)
@RequestMapping("/api/v1/sso")
class SsoCallbackController(
    private val userRepository: UserRepository,
    private val ssoTokenVerifier: SsoTokenVerifier,
) {
    private val log = LoggerFactory.getLogger(SsoCallbackController::class.java)

    @GetMapping("/callback")
    fun callback(
        @RequestParam token: String,
        request: HttpServletRequest,
        response: HttpServletResponse,
    ) {
        // 401 on any signature / expiry / replay failure; logged with a reason code
        // inside SsoTokenVerifier — never logs the raw token or the shared secret.
        val claims = ssoTokenVerifier.verify(token)
        val sub = claims.subject

        // DEBUG-only, temporary: ABCDE's real tokens carry more claims than this
        // controller currently uses (designation_code, primary_zone_id, division_code,
        // phone_number, hrmsid, role, ...) — only sub/iat/exp are read below. This just
        // prints what ABCDE is actually sending so it can be checked before deciding
        // whether to start consuming any of it. log.debug is a no-op unless the
        // in.gov.ir.pia.api.SsoCallbackController logger is explicitly set to DEBUG —
        // remove once no longer needed.
        if (log.isDebugEnabled) {
            log.debug("SSO token claims received: {}", claims.claims)
        }

        // Deny-by-default: only officers already provisioned in PIA can bridge in.
        // Name is intentionally NOT synced from the token — the CSV import is the
        // source of truth for users.name.
        val user =
            userRepository.findByEmployeeIdAndIsActiveTrueAndIsDeletedFalse(sub)
                ?: run {
                    log.warn("SSO callback rejected: reason=USER_NOT_FOUND sub={}", sub)
                    throw ResponseStatusException(HttpStatus.FORBIDDEN, "No PIA account for this user")
                }

        // Start PIA's own session; DummyAuthFilter rebuilds the principal on the next request.
        request.getSession(true).setAttribute(SESSION_USER_ID_KEY, user.id.toString())
        log.info("SSO login succeeded: sub={} userId={}", sub, user.id)

        response.sendRedirect("/")
    }
}
