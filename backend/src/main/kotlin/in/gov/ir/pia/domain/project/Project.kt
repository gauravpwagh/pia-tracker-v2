package `in`.gov.ir.pia.domain.project

import `in`.gov.ir.pia.security.ZoneOwned
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import jakarta.persistence.Version
import java.time.Instant
import java.util.UUID

/**
 * Phase 1.4 stub entity for the `projects` table.
 *
 * Contains only the columns created by `V002__projects_stub.sql`.
 * Phase 1.7 will add more columns (DPR reference, estimated cost, lifecycle
 * state, etc.) via additional Flyway migrations and fields here.
 *
 * Implements [ZoneOwned] so [PiaPermissionEvaluator] can enforce zone-level
 * access checks when this entity is the target of a `@PreAuthorize` call.
 *
 * Rules (domain/CLAUDE.md):
 * - Identity by [id]; no `data class`.
 * - `@Version` for optimistic locking.
 * - Soft-delete via [isDeleted]; hard-delete not permitted.
 * - No bidirectional associations, no cascade attributes.
 */
@Entity
@Table(name = "projects")
class Project(
    @Id
    val id: UUID = UUID.randomUUID(),
    @Column(name = "zone_id", nullable = false)
    override val zoneId: UUID,
    @Column(name = "name", nullable = false, length = 256)
    val name: String,
    @Column(name = "is_deleted", nullable = false)
    val isDeleted: Boolean = false,
    @Column(name = "created_at", nullable = false, updatable = false)
    val createdAt: Instant = Instant.now(),
    @Column(name = "updated_at", nullable = false)
    val updatedAt: Instant = Instant.now(),
    @Version
    val version: Int = 0,
) : ZoneOwned {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is Project) return false
        return id == other.id
    }

    override fun hashCode(): Int = id.hashCode()

    override fun toString(): String = "Project(id=$id, name=$name, zoneId=$zoneId)"
}
