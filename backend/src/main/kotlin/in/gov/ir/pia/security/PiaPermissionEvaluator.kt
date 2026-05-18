package `in`.gov.ir.pia.security

import org.springframework.security.access.PermissionEvaluator
import org.springframework.security.core.Authentication
import org.springframework.stereotype.Component
import java.io.Serializable

/**
 * Spring Security [PermissionEvaluator] implementation for PIA Tracker.
 *
 * Referenced in @PreAuthorize expressions as `@pe`, e.g.:
 *   @PreAuthorize("@pe.hasPermission(authentication, 'LAND_ACQ_VIEW')")
 *
 * Phase 1.3: basic permission lookup against the principal's permission set.
 * Phase 1.4 will add scope/zone checks to the targetId + targetType overload.
 */
@Component("pe")
class PiaPermissionEvaluator : PermissionEvaluator {
    /**
     * Called for `hasPermission(authentication, domainObject, permission)`.
     * For Phase 1.3 we only check whether the principal holds the permission code;
     * the domain object is ignored until Phase 1.4 adds zone-scoped checks.
     */
    override fun hasPermission(
        authentication: Authentication?,
        targetDomainObject: Any?,
        permission: Any?,
    ): Boolean {
        val principal = authentication?.principal as? PiaPrincipal ?: return false
        return principal.hasPermission(permission.toString())
    }

    /**
     * Called for `hasPermission(authentication, targetId, targetType, permission)`.
     * Phase 1.4 will implement zone-scope filtering here.
     */
    override fun hasPermission(
        authentication: Authentication?,
        targetId: Serializable?,
        targetType: String?,
        permission: Any?,
    ): Boolean {
        val principal = authentication?.principal as? PiaPrincipal ?: return false
        return principal.hasPermission(permission.toString())
    }
}
