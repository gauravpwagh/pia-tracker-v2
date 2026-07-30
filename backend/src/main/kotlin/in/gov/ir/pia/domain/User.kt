package `in`.gov.ir.pia.domain

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import jakarta.persistence.Version
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "users")
class User(
    // Assigned identifier (Kotlin-side default), matching every other domain entity
    // in this codebase (Project, ActivityRecord, ...) — NOT @GeneratedValue. Every
    // prior User row has only ever been created via raw SQL (seed migrations, CSV
    // import), so this was never exercised until SsoProvisioningService's save()
    // call: with @GeneratedValue + @Version together, Hibernate's "is this new?"
    // check misreads an already-non-null client-assigned id as an existing row and
    // issues an UPDATE instead of an INSERT — 0 rows affected -> StaleObjectStateException.
    @Id
    val id: UUID = UUID.randomUUID(),
    @Column(name = "employee_id", unique = true)
    val employeeId: String? = null,
    @Column(nullable = false)
    val name: String,
    @Column(nullable = false, unique = true)
    val email: String,
    @Column(name = "designation_code", nullable = false)
    val designationCode: String,
    @Column(name = "primary_zone_id")
    val primaryZoneId: UUID? = null,
    @Column(name = "primary_division_id")
    val primaryDivisionId: UUID? = null,
    @Column(name = "is_active")
    val isActive: Boolean = true,
    @Column(name = "is_system_user")
    val isSystemUser: Boolean = false,
    @Column(name = "last_login_at")
    var lastLoginAt: Instant? = null,
    /**
     * BCrypt hash for the fallback username+password login. NULL until the user first
     * logs in with their HRMS id (the initial password) or sets a password. See
     * [in.gov.ir.pia.service.auth.PasswordAuthService].
     */
    @Column(name = "password_hash")
    var passwordHash: String? = null,
    @Column(name = "password_updated_at")
    var passwordUpdatedAt: Instant? = null,
    @Column(name = "created_at", updatable = false)
    val createdAt: Instant = Instant.now(),
    @Column(name = "created_by_user_id")
    val createdByUserId: UUID? = null,
    @Column(name = "updated_at")
    var updatedAt: Instant = Instant.now(),
    @Column(name = "updated_by_user_id")
    var updatedByUserId: UUID? = null,
    @Column(name = "is_demo")
    val isDemo: Boolean = false,
    @Column(name = "is_deleted")
    val isDeleted: Boolean = false,
    @Column(name = "deleted_at")
    val deletedAt: Instant? = null,
    @Column(name = "deleted_by_user_id")
    val deletedByUserId: UUID? = null,
    @Version
    val version: Int = 0,
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is User) return false
        return id == other.id
    }

    override fun hashCode(): Int = id.hashCode()
}
