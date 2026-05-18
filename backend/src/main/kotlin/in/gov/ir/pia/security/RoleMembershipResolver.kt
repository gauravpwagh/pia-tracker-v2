package `in`.gov.ir.pia.security

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

/**
 * Resolved role membership for a user: all effective role codes, the union of
 * permission codes derived from those roles plus any ad-hoc user_permissions
 * grants, and any active cross-zone assignments.
 */
data class ResolvedMembership(
    val roleCodes: Set<String>,
    val permissions: Set<String>,
    val crossZoneIds: Set<UUID>,
)

/**
 * Computes a user's effective permissions by querying the role/permission tables.
 *
 * Not profile-gated — used by both dummy auth (dev/beta) and real auth (prod).
 *
 * Query strategy: JdbcTemplate to keep multi-table reads simple and avoid
 * lazy-loading pitfalls across transaction boundaries in filters.
 */
@Service
class RoleMembershipResolver(
    private val jdbc: JdbcTemplate,
) {
    /**
     * Resolves the full membership for [userId] with the given [designationCode].
     *
     * 1. Looks up designation_default_roles for the designation → base role codes.
     * 2. Looks up user_roles for the user → additional role codes.
     * 3. Looks up role_permissions for the combined role set → permission codes.
     * 4. Looks up user_permissions for the user (non-expired) → additional permission codes.
     * 5. Looks up user_zone_assignments for the user (active, non-expired) → cross-zone IDs.
     *
     * Returns empty sets gracefully when the role/permission tables are not yet seeded.
     */
    @Transactional(readOnly = true)
    fun resolve(
        userId: UUID,
        designationCode: String,
    ): ResolvedMembership {
        // Step 1: designation default roles
        val designationRoles =
            jdbc
                .queryForList(
                    "SELECT role_code FROM designation_default_roles WHERE designation_code = ?",
                    String::class.java,
                    designationCode,
                ).toMutableSet()

        // Step 2: user-specific role overrides
        val userRoles =
            jdbc.queryForList(
                "SELECT role_code FROM user_roles WHERE user_id = ?",
                String::class.java,
                userId,
            )
        designationRoles.addAll(userRoles)

        val allRoleCodes: Set<String> = designationRoles.toSet()

        // Step 3: permissions from roles
        val rolePermissions: Set<String> =
            if (allRoleCodes.isEmpty()) {
                emptySet()
            } else {
                val placeholders = allRoleCodes.joinToString(",") { "?" }
                jdbc
                    .queryForList(
                        "SELECT DISTINCT permission_code FROM role_permissions WHERE role_code IN ($placeholders)",
                        String::class.java,
                        *allRoleCodes.toTypedArray(),
                    ).toSet()
            }

        // Step 4: ad-hoc user permissions (non-expired)
        val userPermissions =
            jdbc
                .queryForList(
                    """
                    SELECT permission_code FROM user_permissions
                    WHERE user_id = ?
                      AND (expires_at IS NULL OR expires_at > now())
                    """.trimIndent(),
                    String::class.java,
                    userId,
                ).toSet()

        val allPermissions = rolePermissions + userPermissions

        // Step 5: cross-zone assignments
        val crossZoneIds =
            jdbc
                .queryForList(
                    """
                    SELECT zone_id::text FROM user_zone_assignments
                    WHERE user_id = ?
                      AND is_active = true
                      AND (expires_at IS NULL OR expires_at > now())
                    """.trimIndent(),
                    String::class.java,
                    userId,
                ).map { UUID.fromString(it) }
                .toSet()

        return ResolvedMembership(
            roleCodes = allRoleCodes,
            permissions = allPermissions,
            crossZoneIds = crossZoneIds,
        )
    }
}
