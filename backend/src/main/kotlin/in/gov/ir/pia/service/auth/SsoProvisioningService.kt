package `in`.gov.ir.pia.service.auth

import `in`.gov.ir.pia.domain.User
import `in`.gov.ir.pia.repository.DesignationRepository
import `in`.gov.ir.pia.repository.UserRepository
import `in`.gov.ir.pia.repository.ZoneRepository
import com.nimbusds.jwt.JWTClaimsSet
import org.slf4j.LoggerFactory
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.http.HttpStatus
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import java.time.Instant
import java.util.UUID

/**
 * Just-in-time provisioning for SSO logins whose `sub` has no PIA account yet.
 *
 * **This reverses a deliberately documented "deny-by-default, no auto-provisioning"
 * policy** (see `sso-poc/INTEGRATION_SPEC.md` § 4, "non-negotiable" at the time it was
 * written). The product owner has since decided a valid SSO token should be enough to
 * create a fully active account on the spot, trusting the token's `designation_code`
 * / `primary_zone_id` claims for role/scope — accepted with the understanding that
 * this makes token integrity the sole safeguard on who gets an account and what they
 * can access. Anyone who can mint a validly-signed token for an unknown `sub` can now
 * grant themselves an account of the designation their token claims.
 *
 * The exact extra claim set the real partner sends beyond `sub`/`name`/`iat`/`exp` was
 * not fully confirmed at the time this was written — see the DEBUG log in
 * [in.gov.ir.pia.api.SsoCallbackController]. `designation_code` and `primary_zone_id`
 * are read verbatim; anything else (`division_code`, `phone_number`, `hrmsid`, `role`)
 * is currently ignored. Verify the claim names below against a real captured token
 * before relying on this in production.
 */
@Service
class SsoProvisioningService(
    private val userRepository: UserRepository,
    private val designationRepository: DesignationRepository,
    private val zoneRepository: ZoneRepository,
    private val passwordEncoder: PasswordEncoder,
) {
    private val log = LoggerFactory.getLogger(SsoProvisioningService::class.java)

    @Transactional
    fun provisionFromSsoClaims(claims: JWTClaimsSet): User {
        val employeeId = claims.subject

        // An existing-but-inactive/deleted row means an admin deliberately removed
        // this person's access — JIT provisioning must never silently undo that.
        userRepository.findByEmployeeId(employeeId)?.let { existing ->
            log.warn(
                "SSO provisioning refused: reason=ACCOUNT_EXISTS_BUT_INACTIVE sub={} isActive={} isDeleted={}",
                employeeId,
                existing.isActive,
                existing.isDeleted,
            )
            throw ResponseStatusException(
                HttpStatus.FORBIDDEN,
                "An account for this login already exists but is not active — contact an administrator",
            )
        }

        val name = claims.getStringClaim("name")?.trim()
        if (name.isNullOrBlank()) {
            reject(employeeId, "MISSING_CLAIM_NAME")
        }

        val designationCode = claims.getStringClaim("designation_code")?.trim()?.uppercase()
        if (designationCode.isNullOrBlank() || !designationRepository.existsById(designationCode)) {
            reject(employeeId, "MISSING_OR_INVALID_DESIGNATION_CODE", designationCode)
        }

        val zoneClaim = claims.getStringClaim("primary_zone_id")?.trim()
        val zoneId = zoneClaim?.let { resolveZone(it, employeeId) }

        val user =
            User(
                employeeId = employeeId,
                name = name,
                // The token carries no email claim (see INTEGRATION_SPEC.md § 2). Same
                // placeholder convention as scripts/import_users_abcde.py's CSV fallback.
                email = "$employeeId@gov.in",
                designationCode = designationCode,
                primaryZoneId = zoneId,
                isActive = true,
                isSystemUser = false,
                // Same convention as ABCDE-sourced CSV imports: BCrypt(employee_id) so
                // the fallback password-login path works identically for this user too.
                passwordHash = passwordEncoder.encode(employeeId),
                passwordUpdatedAt = Instant.now(),
            )

        val saved =
            try {
                userRepository.saveAndFlush(user)
            } catch (e: DataIntegrityViolationException) {
                log.warn("SSO provisioning failed: reason=DUPLICATE_EMPLOYEE_ID_OR_EMAIL sub={}", employeeId)
                throw ResponseStatusException(HttpStatus.CONFLICT, "Could not provision account for this login")
            }

        log.info(
            "SSO JIT-provisioned new user: sub={} userId={} designation={} zoneClaim={} resolvedZoneId={}",
            employeeId,
            saved.id,
            designationCode,
            zoneClaim,
            zoneId,
        )
        return saved
    }

    /**
     * Resolves a zone claim by code first (the established convention everywhere else
     * in this codebase — CSV import, seed migrations), falling back to treating it as
     * a raw zone UUID in case the real partner sends that instead. An unresolvable
     * non-blank claim is rejected outright rather than silently defaulting to a null
     * (pan-India-like) zone, which would be a worse, quieter failure for a
     * zone-scoped designation.
     */
    private fun resolveZone(raw: String, employeeId: String): UUID {
        zoneRepository.findByCode(raw.uppercase())?.let { return it.id }
        runCatching { UUID.fromString(raw) }.getOrNull()?.let { asUuid ->
            if (zoneRepository.existsById(asUuid)) return asUuid
        }
        reject(employeeId, "UNRESOLVABLE_ZONE_CLAIM", raw)
    }

    private fun reject(employeeId: String, reasonCode: String, detail: String? = null): Nothing {
        log.warn("SSO provisioning rejected: reason={} sub={} detail={}", reasonCode, employeeId, detail ?: "-")
        throw ResponseStatusException(HttpStatus.FORBIDDEN, "Cannot provision account from SSO token: $reasonCode")
    }
}
