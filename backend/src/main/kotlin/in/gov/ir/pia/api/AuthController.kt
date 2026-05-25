package `in`.gov.ir.pia.api

import `in`.gov.ir.pia.repository.DesignationRepository
import `in`.gov.ir.pia.repository.UserRepository
import `in`.gov.ir.pia.security.DummyAuthFilter.Companion.SESSION_USER_ID_KEY
import `in`.gov.ir.pia.security.PiaPrincipal
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpSession
import org.springframework.context.annotation.Profile
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
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
)

data class SelectUserRequest(
    val userId: UUID,
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
) {
    /**
     * Returns active, non-deleted users for the role-picker dropdown.
     *
     * @param designationCode Optional filter — when supplied, returns only users with
     *   that designation (e.g. "CE_C" for the allocation picker, "DY_CE_C" for the
     *   assign-Dy-CE/C picker).  Omit to get all users.
     */
    @GetMapping("/users")
    fun listUsers(
        @RequestParam(required = false) designationCode: String?,
    ): List<UserSummaryResponse> {
        // Build a code → shortLabel lookup once; avoids N+1 per user.
        val shortLabels: Map<String, String> =
            designationRepository
                .findAllByOrderByDisplayOrder()
                .associate { it.code to it.shortLabel }

        val users =
            if (designationCode != null) {
                userRepository.findAllByDesignationCodeAndIsActiveTrueAndIsDeletedFalseOrderByName(designationCode)
            } else {
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
            )
        }
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
