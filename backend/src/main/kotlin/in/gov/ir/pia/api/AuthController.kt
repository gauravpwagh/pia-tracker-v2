package `in`.gov.ir.pia.api

import `in`.gov.ir.pia.repository.DesignationRepository
import `in`.gov.ir.pia.repository.UserRepository
import `in`.gov.ir.pia.repository.ZoneRepository
import `in`.gov.ir.pia.security.DummyAuthFilter.Companion.SESSION_USER_ID_KEY
import `in`.gov.ir.pia.security.PiaPrincipal
import `in`.gov.ir.pia.service.auth.PasswordAuthService
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpSession
import org.springframework.context.annotation.Profile
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

// ─── DTOs ──────────────────────────────────────────────────────────────────────

data class UserSummaryResponse(
    val id: UUID,
    val name: String,
    val email: String,
    val designationCode: String,
    /** Human-readable label from designations.short_label, e.g. "EDGS/C-I", "Dy CE/C". */
    val designationShortLabel: String,
    val primaryZoneId: UUID?,
    /** Short name of the user's primary zone, e.g. "NR", "SCR". Null for system users. */
    val primaryZoneName: String?,
    /** True for seeded demo/test users; false for actual provisioned users. */
    val isDemo: Boolean,
)

data class SelectUserRequest(
    val userId: UUID,
)

data class LoginRequest(
    /** HRMS id (employee_id) or email. */
    val username: String,
    val password: String,
)

data class ChangePasswordRequest(
    val currentPassword: String,
    val newPassword: String,
)

data class PrincipalResponse(
    val userId: UUID,
    val name: String,
    val email: String,
    val designationCode: String,
    val primaryZoneId: UUID?,
    val accessibleZoneIds: Set<UUID>,
    val permissions: Set<String>,
    val isSuperAdmin: Boolean,
)

// ─── Controller ────────────────────────────────────────────────────────────────

/**
 * Dummy auth endpoints — available in dev and beta profiles only.
 *
 * These endpoints are intentionally NOT @PreAuthorize-gated: they exist to
 * establish auth in the first place. Security is provided by the @Profile guard
 * and the explicit permit-all in SecurityConfig.
 *
 * Endpoints:
 *   GET  /api/v1/auth/users        — list all active users (for role picker)
 *   POST /api/v1/auth/select-user  — set the active session user
 *   POST /api/v1/auth/logout       — clear the session
 *   GET  /api/v1/auth/me           — return current principal (401 if none)
 */
@RestController
@Profile("dev", "beta")
@RequestMapping("/api/v1/auth")
class AuthController(
    private val userRepository: UserRepository,
    private val designationRepository: DesignationRepository,
    private val zoneRepository: ZoneRepository,
    private val jdbc: JdbcTemplate,
    private val passwordAuthService: PasswordAuthService,
) {
    /**
     * Returns active, non-deleted users for the role-picker dropdown.
     *
     * @param designationCode Optional filter — when supplied, returns users with that
     *   designation AND any other designation that shares the same default role(s)
     *   (e.g. "CE_C" for the allocation picker, "DY_CE_C" for the assign-Dy-CE/C
     *   picker). This matters because most HRMS-imported users carry a general
     *   designation code like "DY_CE" rather than the exact "DY_CE_C", even though
     *   `designation_default_roles` grants them ROLE_DY_CE_C — see [resolveEquivalentDesignationCodes].
     *   Omit to get all users.
     */
    @GetMapping("/users")
    fun listUsers(
        @RequestParam(required = false) designationCode: String?,
        @RequestParam(required = false) zoneId: UUID?,
    ): List<UserSummaryResponse> {
        // Build a code → shortLabel lookup once; avoids N+1 per user.
        val shortLabels: Map<String, String> =
            designationRepository
                .findAllByOrderByDisplayOrder()
                .associate { it.code to it.shortLabel }

        val zoneNames: Map<UUID, String> =
            zoneRepository
                .findAllByIsActiveTrueOrderByDisplayOrder()
                .associate { it.id to it.shortName }

        val users = when {
            designationCode != null && zoneId != null ->
                userRepository.findAllByDesignationCodeInAndPrimaryZoneIdAndIsActiveTrueAndIsDeletedFalseOrderByName(
                    resolveEquivalentDesignationCodes(designationCode), zoneId,
                )
            designationCode != null ->
                userRepository.findAllByDesignationCodeInAndIsActiveTrueAndIsDeletedFalseOrderByName(
                    resolveEquivalentDesignationCodes(designationCode),
                )
            else ->
                userRepository.findAllByIsActiveTrueAndIsDeletedFalseOrderByDesignationCodeAscNameAsc()
        }

        return users.map { user ->
            UserSummaryResponse(
                id = user.id,
                name = user.name,
                email = user.email,
                designationCode = user.designationCode,
                designationShortLabel = shortLabels[user.designationCode] ?: user.designationCode,
                primaryZoneId = user.primaryZoneId,
                primaryZoneName = user.primaryZoneId?.let { zoneNames[it] },
                isDemo = user.isDemo,
            )
        }
    }

    /**
     * Expands [designationCode] to every designation code that shares at least one
     * of its `designation_default_roles` role(s) — e.g. "DY_CE_C" expands to
     * {"DY_CE_C", "DY_CE", "DY_CE_GS"} because all three grant ROLE_DY_CE_C.
     *
     * Without this, role pickers (assign CE/C, assign Dy CE/C) would only match
     * users whose designation_code is the exact literal string, missing the bulk
     * of HRMS-imported users who carry a general designation like "DY_CE".
     */
    private fun resolveEquivalentDesignationCodes(designationCode: String): Set<String> {
        val roleCodes =
            jdbc.queryForList(
                "SELECT role_code FROM designation_default_roles WHERE designation_code = ?",
                String::class.java,
                designationCode,
            )
        if (roleCodes.isEmpty()) return setOf(designationCode)

        val placeholders = roleCodes.joinToString(",") { "?" }
        val equivalentCodes =
            jdbc.queryForList(
                "SELECT DISTINCT designation_code FROM designation_default_roles WHERE role_code IN ($placeholders)",
                String::class.java,
                *roleCodes.toTypedArray(),
            )
        return (equivalentCodes + designationCode).toSet()
    }

    /**
     * Sets the current session user. The [DummyAuthFilter] picks up the session
     * attribute on the next request and populates the SecurityContext.
     */
    @PostMapping("/select-user")
    fun selectUser(
        @RequestBody body: SelectUserRequest,
        request: HttpServletRequest,
    ): PrincipalResponse {
        val user =
            userRepository.findByIdAndIsActiveTrueAndIsDeletedFalse(body.userId)
                ?: throw ResponseStatusException(HttpStatus.BAD_REQUEST, "User not found or inactive")

        val session: HttpSession = request.getSession(true)
        session.setAttribute(SESSION_USER_ID_KEY, user.id.toString())

        // The filter hasn't run yet for this request, so build the response directly.
        // The next request will go through DummyAuthFilter with the session set.
        return PrincipalResponse(
            userId = user.id,
            name = user.name,
            email = user.email,
            designationCode = user.designationCode,
            primaryZoneId = user.primaryZoneId,
            // Cross-zone and permissions resolve on subsequent requests via the filter.
            // Return empty sets here — /me will return the full resolved principal.
            accessibleZoneIds = setOfNotNull(user.primaryZoneId),
            permissions = emptySet(),
            isSuperAdmin = user.designationCode == "SUPER_ADMIN",
        )
    }

    /**
     * Fallback username+password login. Username is the HRMS id (or email); the initial
     * password is the HRMS id (see [PasswordAuthService]). On success, sets the session
     * user so [DummyAuthFilter] builds the principal on the next request — same mechanism
     * as [selectUser].
     */
    @PostMapping("/login")
    fun login(
        @RequestBody body: LoginRequest,
        request: HttpServletRequest,
    ): PrincipalResponse {
        val user = passwordAuthService.login(body.username, body.password)

        val session: HttpSession = request.getSession(true)
        session.setAttribute(SESSION_USER_ID_KEY, user.id.toString())

        return PrincipalResponse(
            userId = user.id,
            name = user.name,
            email = user.email,
            designationCode = user.designationCode,
            primaryZoneId = user.primaryZoneId,
            accessibleZoneIds = setOfNotNull(user.primaryZoneId),
            permissions = emptySet(),
            isSuperAdmin = user.designationCode == "SUPER_ADMIN",
        )
    }

    /** Self-service password change for the currently authenticated user. */
    @PostMapping("/change-password")
    fun changePassword(
        @RequestBody body: ChangePasswordRequest,
        @AuthenticationPrincipal principal: PiaPrincipal?,
    ): ResponseEntity<Void> {
        principal ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "No active session")
        passwordAuthService.changePassword(principal.userId, body.currentPassword, body.newPassword)
        return ResponseEntity.noContent().build()
    }

    /** Invalidates the current session. */
    @PostMapping("/logout")
    fun logout(request: HttpServletRequest): ResponseEntity<Void> {
        request.getSession(false)?.invalidate()
        return ResponseEntity.noContent().build()
    }

    /**
     * Returns the currently authenticated principal, or 401 if no session user
     * has been selected.
     */
    @GetMapping("/me")
    fun me(
        @AuthenticationPrincipal principal: PiaPrincipal?,
    ): PrincipalResponse {
        principal ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "No active session")
        return PrincipalResponse(
            userId = principal.userId,
            name = principal.name,
            email = principal.email,
            designationCode = principal.designationCode,
            primaryZoneId = principal.primaryZoneId,
            accessibleZoneIds = principal.accessibleZoneIds,
            permissions = principal.permissions,
            isSuperAdmin = principal.isSuperAdmin,
        )
    }
}
