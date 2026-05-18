package `in`.gov.ir.pia.security

import `in`.gov.ir.pia.repository.UserRepository
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.context.annotation.Profile
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter
import java.util.UUID

/**
 * Development / beta only filter that reads a user ID from the HTTP session
 * and populates the SecurityContext with a [PiaPrincipal].
 *
 * This filter MUST NOT run in production. It is gated by @Profile("dev", "beta")
 * so that the prod Spring context never loads it.
 *
 * Note: this filter does NOT open a @Transactional boundary — filters run outside
 * the Spring transaction infrastructure. [RoleMembershipResolver] opens its own
 * read-only transaction internally.
 */
@Component
@Profile("dev", "beta")
class DummyAuthFilter(
    private val userRepository: UserRepository,
    private val roleMembershipResolver: RoleMembershipResolver,
) : OncePerRequestFilter() {
    companion object {
        /** HttpSession attribute key that holds the selected user's UUID. */
        const val SESSION_USER_ID_KEY = "PIA_USER_ID"
    }

    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain,
    ) {
        val session = request.getSession(false)
        val rawUserId = session?.getAttribute(SESSION_USER_ID_KEY) as? String

        if (rawUserId != null) {
            val userId = runCatching { UUID.fromString(rawUserId) }.getOrNull()
            if (userId != null) {
                val user = userRepository.findByIdAndIsActiveTrueAndIsDeletedFalse(userId)
                if (user != null) {
                    val membership = roleMembershipResolver.resolve(user.id, user.designationCode)
                    val isSuperAdmin = user.designationCode == "SUPER_ADMIN"

                    val principal =
                        PiaPrincipal(
                            userId = user.id,
                            name = user.name,
                            email = user.email,
                            designationCode = user.designationCode,
                            primaryZoneId = user.primaryZoneId,
                            primaryDivisionId = user.primaryDivisionId,
                            crossZoneIds = membership.crossZoneIds,
                            roleCodes = membership.roleCodes,
                            permissions = membership.permissions,
                            isSuperAdmin = isSuperAdmin,
                        )

                    val authorities =
                        membership.roleCodes
                            .map { SimpleGrantedAuthority("ROLE_$it") }
                            .toMutableList<SimpleGrantedAuthority>()

                    val auth = UsernamePasswordAuthenticationToken(principal, null, authorities)
                    SecurityContextHolder.getContext().authentication = auth
                }
            }
        }

        filterChain.doFilter(request, response)
    }
}
