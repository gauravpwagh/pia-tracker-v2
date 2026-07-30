package `in`.gov.ir.pia.api

import `in`.gov.ir.pia.repository.UserRepository
import `in`.gov.ir.pia.security.DummyAuthFilter.Companion.SESSION_USER_ID_KEY
import `in`.gov.ir.pia.security.SsoProperties
import `in`.gov.ir.pia.security.SsoTokenVerifier
import `in`.gov.ir.pia.service.auth.SsoProvisioningService
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.slf4j.LoggerFactory
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Profile
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

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
 * A user not yet provisioned in PIA is created on the spot from the token's claims
 * (see [SsoProvisioningService]) rather than rejected — this reverses the SSO spec's
 * original "deny-by-default, no auto-provisioning" policy; see that class's doc
 * comment for what changed and the security tradeoff accepted in doing so.
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
    private val ssoProvisioningService: SsoProvisioningService,
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

        // DEBUG-only: ABCDE's real tokens have been observed carrying more claims than
        // the original spec documents (designation_code, primary_zone_id, division_code,
        // phone_number, hrmsid, role, ...) — SsoProvisioningService now reads
        // designation_code/primary_zone_id for JIT provisioning below. This still prints
        // the full claim set so a mismatch against the exact key names it expects is
        // easy to catch. log.debug is a no-op unless the
        // in.gov.ir.pia.api.SsoCallbackController logger is explicitly set to DEBUG.
        if (log.isDebugEnabled) {
            log.debug("SSO token claims received: {}", claims.claims)
        }

        // Existing officer bridging in as normal. A user not found here is handed to
        // SsoProvisioningService, which creates a fully active account from the token's
        // claims (designation_code/primary_zone_id) rather than rejecting — see that
        // class's doc comment for the security tradeoff this accepts.
        val user =
            userRepository.findByEmployeeIdAndIsActiveTrueAndIsDeletedFalse(sub)
                ?: ssoProvisioningService.provisionFromSsoClaims(claims)

        // Start PIA's own session; DummyAuthFilter rebuilds the principal on the next request.
        request.getSession(true).setAttribute(SESSION_USER_ID_KEY, user.id.toString())
        log.info("SSO login succeeded: sub={} userId={}", sub, user.id)

        response.sendRedirect("/")
    }
}
