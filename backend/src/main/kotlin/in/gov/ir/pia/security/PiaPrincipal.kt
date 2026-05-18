package `in`.gov.ir.pia.security

import java.util.UUID

/**
 * Principal interface — the single carrier of identity for a request.
 *
 * See docs/permissions.md § 9 for the authoritative specification.
 * Every method that needs to know "who is calling" receives this interface,
 * never a raw Spring Authentication or user entity.
 */
interface Principal {
    val userId: UUID
    val designationCode: String
    val primaryZoneId: UUID?
    val primaryDivisionId: UUID?
    val crossZoneIds: Set<UUID>

    /** All zones this principal can read/write — primary + cross-zone grants. */
    val accessibleZoneIds: Set<UUID>

    val roleCodes: Set<String>

    /** Union of role-derived permissions and ad-hoc user_permissions grants. */
    val permissions: Set<String>

    val isSuperAdmin: Boolean

    fun hasPermission(code: String): Boolean

    fun canAccessZone(zoneId: UUID): Boolean
}

/**
 * Concrete implementation of [Principal], built once per request by [DummyAuthFilter]
 * (dev/beta) or the real authentication provider (prod).
 */
data class PiaPrincipal(
    override val userId: UUID,
    val name: String,
    val email: String,
    override val designationCode: String,
    override val primaryZoneId: UUID?,
    override val primaryDivisionId: UUID?,
    override val crossZoneIds: Set<UUID>,
    override val roleCodes: Set<String>,
    override val permissions: Set<String>,
    override val isSuperAdmin: Boolean,
) : Principal {
    override val accessibleZoneIds: Set<UUID>
        get() =
            buildSet {
                primaryZoneId?.let { add(it) }
                addAll(crossZoneIds)
            }

    override fun hasPermission(code: String): Boolean = isSuperAdmin || permissions.contains(code)

    override fun canAccessZone(zoneId: UUID): Boolean = isSuperAdmin || accessibleZoneIds.contains(zoneId)
}
