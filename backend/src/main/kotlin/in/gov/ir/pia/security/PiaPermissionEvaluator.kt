package `in`.gov.ir.pia.security

import org.springframework.security.access.PermissionEvaluator
import org.springframework.security.core.Authentication
import org.springframework.stereotype.Component
import java.io.Serializable

/**
 * Spring Security [PermissionEvaluator] implementation for PIA Tracker.
 *
 * Referenced in @PreAuthorize expressions as `@pe`, e.g.:
 *   @PreAuthorize("@pe.hasPermission(authentication, null, 'PROJECT.CREATE')")
 *   @PreAuthorize("@pe.hasPermission(authentication, #project, 'PROJECT.READ.OWN')")
 *
 * ## Scope implication rules
 *
 * Permission codes may carry a trailing scope suffix: `.OWN`, `.ZONE`, or `.ALL`.
 * A broader scope implies a narrower one:
 *
 *   ALL ⊇ ZONE ⊇ OWN
 *
 * So a principal holding `PROJECT.READ.ALL` automatically passes a check for
 * `PROJECT.READ.ZONE` or `PROJECT.READ.OWN`.  The evaluator expands the
 * requested code into the full implication chain before checking.
 *
 * ## Zone checks
 *
 * When the target domain object implements [ZoneOwned] and the matching
 * permission has a `.ZONE` or `.OWN` scope, the principal's accessible zones
 * must include the target's zone.  A null target zone is treated as accessible
 * (some entities are zone-independent).
 *
 * `.ALL` permissions bypass zone checks entirely.
 *
 * ## SUPER_ADMIN bypass
 *
 * A principal with [PiaPrincipal.isSuperAdmin] == true passes every check
 * unconditionally.
 *
 * ## ID-based overload
 *
 * The `hasPermission(auth, targetId, targetType, permission)` overload is
 * reserved for future use (Phase 1.7+ will wire repositories here).  For now
 * it delegates to the object overload with a null target, performing only a
 * permission-code check with scope implication but no zone check.
 */
@Component("pe")
class PiaPermissionEvaluator : PermissionEvaluator {
    /**
     * Called for `@pe.hasPermission(authentication, domainObject, permission)`.
     *
     * @param targetDomainObject the entity being accessed, or null for
     *   capability-only checks (e.g. "can this user create projects?")
     */
    override fun hasPermission(
        authentication: Authentication?,
        targetDomainObject: Any?,
        permission: Any?,
    ): Boolean {
        val principal = authentication?.principal as? PiaPrincipal ?: return false
        val code = permission?.toString() ?: return false
        if (principal.isSuperAdmin) return true

        val zoneOwned = targetDomainObject as? ZoneOwned

        for (candidate in expandedCodes(code)) {
            if (!principal.permissions.contains(candidate)) continue

            val scope = scopeSuffix(candidate)
            if (scope == null || scope == "ALL") return true

            // .ZONE or .OWN: verify zone access when a target zone is present.
            val targetZone = zoneOwned?.zoneId
            if (targetZone == null || principal.canAccessZone(targetZone)) return true
        }
        return false
    }

    /**
     * Called for `@pe.hasPermission(authentication, targetId, targetType, permission)`.
     *
     * Phase 1.7 will implement entity loading from repositories here.
     * Until then, performs a permission+scope check without a zone target.
     */
    override fun hasPermission(
        authentication: Authentication?,
        targetId: Serializable?,
        targetType: String?,
        permission: Any?,
    ): Boolean = hasPermission(authentication, null, permission)

    // ── helpers ──────────────────────────────────────────────────────────────

    /**
     * Returns [code] plus any broader-scope variants that imply it.
     *
     * Examples:
     *   "PROJECT.READ.OWN"  → ["PROJECT.READ.OWN", "PROJECT.READ.ZONE", "PROJECT.READ.ALL"]
     *   "PROJECT.READ.ZONE" → ["PROJECT.READ.ZONE", "PROJECT.READ.ALL"]
     *   "PROJECT.CREATE"    → ["PROJECT.CREATE"]
     */
    private fun expandedCodes(code: String): List<String> {
        val parts = code.split(".")
        return when (parts.lastOrNull()) {
            "OWN" -> {
                val base = parts.dropLast(1).joinToString(".")
                listOf(code, "$base.ZONE", "$base.ALL")
            }
            "ZONE" -> {
                val base = parts.dropLast(1).joinToString(".")
                listOf(code, "$base.ALL")
            }
            else -> listOf(code)
        }
    }

    /** Returns the scope suffix (OWN / ZONE / ALL) or null if the code has none. */
    private fun scopeSuffix(code: String): String? =
        when (val last = code.split(".").lastOrNull()) {
            "OWN", "ZONE", "ALL" -> last
            else -> null
        }
}
