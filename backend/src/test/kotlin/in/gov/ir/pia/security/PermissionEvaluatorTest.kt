package `in`.gov.ir.pia.security

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.CsvSource
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.core.Authentication
import java.util.UUID

/**
 * Unit tests for [PiaPermissionEvaluator].
 *
 * Covers:
 * - Scope implication: ALL ⊇ ZONE ⊇ OWN
 * - Zone check: zone-scoped permission passes only when the target's zone is
 *   in the principal's accessible zones
 * - Super-admin bypass
 * - Non-scope permissions (no suffix)
 * - Gate matrix: key designation types × key permission codes
 */
class PermissionEvaluatorTest {
    private val evaluator = PiaPermissionEvaluator()

    private val nrZone = UUID.fromString("aaaaaaaa-0000-0000-0000-000000000001")
    private val scrZone = UUID.fromString("aaaaaaaa-0000-0000-0000-000000000002")

    private fun auth(principal: PiaPrincipal): Authentication = UsernamePasswordAuthenticationToken(principal, null, emptyList())

    private fun principal(
        permissions: Set<String>,
        primaryZoneId: UUID? = nrZone,
        crossZoneIds: Set<UUID> = emptySet(),
        isSuperAdmin: Boolean = false,
    ) = PiaPrincipal(
        userId = UUID.randomUUID(),
        name = "Test User",
        email = "test@test.com",
        designationCode = "CE_C",
        primaryZoneId = primaryZoneId,
        primaryDivisionId = null,
        crossZoneIds = crossZoneIds,
        roleCodes = emptySet(),
        permissions = permissions,
        isSuperAdmin = isSuperAdmin,
    )

    private fun zoneOwned(zoneId: UUID?) =
        object : ZoneOwned {
            override val zoneId: UUID? = zoneId
        }

    private fun check(
        principal: PiaPrincipal,
        target: Any?,
        code: String,
    ) = evaluator.hasPermission(auth(principal), target, code)

    // ── super-admin bypass ────────────────────────────────────────────────────

    @Test
    fun `super admin passes every permission check`() {
        val sa = principal(permissions = emptySet(), isSuperAdmin = true)
        assertThat(check(sa, null, "PROJECT.READ.OWN")).isTrue()
        assertThat(check(sa, null, "PERMISSION.GRANT")).isTrue()
        assertThat(check(sa, zoneOwned(scrZone), "PROJECT.READ.OWN")).isTrue()
    }

    // ── scope implication ─────────────────────────────────────────────────────

    @Test
    fun `ALL scope implies ZONE and OWN`() {
        val p = principal(permissions = setOf("PROJECT.READ.ALL"))
        assertThat(check(p, null, "PROJECT.READ.ALL")).isTrue()
        assertThat(check(p, null, "PROJECT.READ.ZONE")).isTrue()
        assertThat(check(p, null, "PROJECT.READ.OWN")).isTrue()
    }

    @Test
    fun `ZONE scope implies OWN but not ALL`() {
        val p = principal(permissions = setOf("PROJECT.READ.ZONE"))
        assertThat(check(p, null, "PROJECT.READ.ALL")).isFalse()
        assertThat(check(p, null, "PROJECT.READ.ZONE")).isTrue()
        assertThat(check(p, null, "PROJECT.READ.OWN")).isTrue()
    }

    @Test
    fun `OWN scope does not imply ZONE or ALL`() {
        val p = principal(permissions = setOf("PROJECT.READ.OWN"))
        assertThat(check(p, null, "PROJECT.READ.ALL")).isFalse()
        assertThat(check(p, null, "PROJECT.READ.ZONE")).isFalse()
        assertThat(check(p, null, "PROJECT.READ.OWN")).isTrue()
    }

    @Test
    fun `non-scoped permission does not benefit from scope implication`() {
        val p = principal(permissions = setOf("PROJECT.CREATE"))
        assertThat(check(p, null, "PROJECT.CREATE")).isTrue()
        assertThat(check(p, null, "PROJECT.READ.OWN")).isFalse()
    }

    // ── zone checks ───────────────────────────────────────────────────────────

    @Test
    fun `ZONE-scoped permission passes when target zone matches primary zone`() {
        val p = principal(permissions = setOf("PROJECT.READ.ZONE"), primaryZoneId = nrZone)
        val target = zoneOwned(nrZone)
        assertThat(check(p, target, "PROJECT.READ.ZONE")).isTrue()
    }

    @Test
    fun `ZONE-scoped permission fails when target zone is outside accessible zones`() {
        val p = principal(permissions = setOf("PROJECT.READ.ZONE"), primaryZoneId = nrZone)
        val target = zoneOwned(scrZone)
        assertThat(check(p, target, "PROJECT.READ.ZONE")).isFalse()
    }

    @Test
    fun `ZONE-scoped permission passes for cross-zone grant`() {
        val p =
            principal(
                permissions = setOf("PROJECT.READ.ZONE"),
                primaryZoneId = nrZone,
                crossZoneIds = setOf(scrZone),
            )
        val target = zoneOwned(scrZone)
        assertThat(check(p, target, "PROJECT.READ.ZONE")).isTrue()
    }

    @Test
    fun `ALL-scoped permission bypasses zone check`() {
        val p = principal(permissions = setOf("PROJECT.READ.ALL"), primaryZoneId = nrZone)
        // Principal's primary zone is NR but target is SCR; ALL bypasses the check.
        val target = zoneOwned(scrZone)
        assertThat(check(p, target, "PROJECT.READ.OWN")).isTrue()
    }

    @Test
    fun `null target zone is treated as accessible`() {
        val p = principal(permissions = setOf("PROJECT.READ.ZONE"), primaryZoneId = nrZone)
        val target = zoneOwned(null)
        assertThat(check(p, target, "PROJECT.READ.ZONE")).isTrue()
    }

    @Test
    fun `null target passes zone check — no domain object provided`() {
        val p = principal(permissions = setOf("PROJECT.READ.ZONE"), primaryZoneId = nrZone)
        assertThat(check(p, null, "PROJECT.READ.ZONE")).isTrue()
    }

    // ── principal with no permissions ─────────────────────────────────────────

    @Test
    fun `principal with empty permission set fails all checks`() {
        val p = principal(permissions = emptySet())
        assertThat(check(p, null, "PROJECT.READ.OWN")).isFalse()
        assertThat(check(p, null, "PROJECT.CREATE")).isFalse()
    }

    // ── permission gate matrix ────────────────────────────────────────────────

    /**
     * For each designation type, asserts that [hasPermission] returns the
     * expected result for a representative permission code.
     *
     * Permission sets mirror the role bundles in permissions.md § 3.
     * These are capability checks only (null target, no zone lookup).
     */
    @ParameterizedTest(name = "[{index}] {0} + {1} → {2}")
    @CsvSource(
        "EDGS_CI, PROJECT.CREATE, true",
        "EDGS_CI, PROJECT.READ.ALL, true",
        "EDGS_CI, PROJECT.READ.ZONE, true",
        "EDGS_CI, PROJECT.READ.OWN, true",
        "EDGS_CI, PROJECT.ALLOCATE, false",
        "EDGS_CI, DASHBOARD.VIEW.PAN_INDIA, true",
        "EDGS_CI, DASHBOARD.VIEW.ZONE, false",
        "CAO_C, PROJECT.READ.ZONE, true",
        "CAO_C, PROJECT.READ.ALL, false",
        "CAO_C, PROJECT.ALLOCATE, true",
        "CAO_C, PROJECT.ASSIGN_DYCE, false",
        "CAO_C, DASHBOARD.VIEW.ZONE, true",
        "CAO_C, DASHBOARD.VIEW.PAN_INDIA, false",
        "CE_C, PROJECT.READ.OWN, true",
        "CE_C, PROJECT.READ.ZONE, false",
        "CE_C, ACTIVITY_RECORD.AUTHENTICATE, true",
        "CE_C, ACTIVITY_RECORD.VERIFY, false",
        "CE_C, PROJECT.ALLOCATE, false",
        "DY_CE_C, ACTIVITY_RECORD.SUBMIT, true",
        "DY_CE_C, ACTIVITY_RECORD.VERIFY, false",
        "DY_CE_C, ACTIVITY_RECORD.AUTHENTICATE, false",
        "DY_CE_C, PROJECT.CREATE, false",
        "ADMIN, USER.READ, true",
        "ADMIN, USER.CREATE, true",
        "ADMIN, PROJECT.READ.OWN, false",
        "ADMIN, PERMISSION.GRANT, false",
    )
    fun `permission gate matrix`(
        designationCode: String,
        permCode: String,
        expected: Boolean,
    ) {
        val permissions = permissionsFor(designationCode.trim())
        val p = principal(permissions = permissions)
        assertThat(check(p, null, permCode.trim()))
            .`as`("$designationCode should${if (expected) "" else " NOT"} have $permCode")
            .isEqualTo(expected)
    }

    /**
     * Returns the permission set for a designation, mirroring the seed data in
     * V001_007__seed_role_permissions.sql.  Used only in unit tests so we don't
     * need a real DB; the integration tests verify the actual seed data.
     */
    private fun permissionsFor(designationCode: String): Set<String> =
        when (designationCode) {
            "EDGS_CI" ->
                setOf(
                    "PROJECT.CREATE",
                    "PROJECT.READ.ALL",
                    "PROJECT.UPDATE.OWN",
                    "PROJECT.DROP",
                    "DASHBOARD.VIEW.PAN_INDIA",
                    "EXPORT.PAN_INDIA",
                    "COMMENT.CREATE",
                    "AUDIT_LOG.READ.OWN",
                )
            "CAO_C" ->
                setOf(
                    "PROJECT.READ.ZONE",
                    "PROJECT.ALLOCATE",
                    "PROJECT.HOLD_RESUME",
                    "ACTIVITY.READ.ZONE",
                    "ACTIVITY_RECORD.READ.ZONE",
                    "DASHBOARD.VIEW.ZONE",
                    "EXPORT.ZONE",
                    "COMMENT.CREATE",
                    "AUDIT_LOG.READ.OWN",
                )
            "CE_C" ->
                setOf(
                    "PROJECT.READ.OWN",
                    "PROJECT.ASSIGN_DYCE",
                    "PROJECT.DESIGNATE_NODAL",
                    "PROJECT.HOLD_RESUME",
                    "PROJECT.COMPLETE",
                    "ACTIVITY.READ.OWN",
                    "ACTIVITY.UPDATE.OWN",
                    "ACTIVITY_RECORD.READ.OWN",
                    "ACTIVITY_RECORD.UPDATE.OWN",
                    "ACTIVITY_RECORD.AUTHENTICATE",
                    "ACTIVITY_RECORD.SEND_BACK",
                    "ACTIVITY_RECORD.BULK_TRANSITION",
                    "DRAWING.EDIT_APPROVERS",
                    "DRAWING.REASSIGN_APPROVER",
                    "DASHBOARD.VIEW.PROJECT",
                    "EXPORT.PROJECT",
                    "ATTACHMENT.DOWNLOAD",
                    "COMMENT.CREATE",
                    "AUDIT_LOG.READ.OWN",
                )
            "DY_CE_C" ->
                setOf(
                    "PROJECT.READ.OWN",
                    "ACTIVITY.CREATE.ASSIGNED",
                    "ACTIVITY.READ.OWN",
                    "ACTIVITY_RECORD.CREATE.ASSIGNED",
                    "ACTIVITY_RECORD.READ.OWN",
                    "ACTIVITY_RECORD.UPDATE.OWN",
                    "ACTIVITY_RECORD.SUBMIT",
                    "ATTACHMENT.UPLOAD.OWN_RECORDS",
                    "ATTACHMENT.DOWNLOAD",
                    "COMMENT.CREATE",
                    "DASHBOARD.VIEW.PROJECT",
                    "AUDIT_LOG.READ.OWN",
                )
            "ADMIN" ->
                setOf(
                    "USER.READ",
                    "USER.CREATE",
                    "USER.UPDATE",
                    "USER.DEACTIVATE",
                    "ROLE.MANAGE",
                    "FORM_DEFINITION.READ",
                    "FORM_DEFINITION.UPDATE",
                    "FORM_DEFINITION.PUBLISH",
                    "FEATURE_FLAG.MANAGE",
                    "AUDIT_LOG.READ.ALL",
                    "COMMENT.DELETE.ANY",
                    "ATTACHMENT.DELETE.ANY",
                )
            else -> emptySet()
        }
}
