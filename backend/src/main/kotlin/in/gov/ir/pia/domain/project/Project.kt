package `in`.gov.ir.pia.domain.project

import `in`.gov.ir.pia.security.ZoneOwned
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import jakarta.persistence.Version
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

/**
 * The `projects` table entity.
 *
 * Phase 1.4 stub columns (`id`, `zone_id`, `name`, `is_deleted`, `version`,
 * `created_at`, `updated_at`) were created by `V002__projects_stub.sql`.
 *
 * Phase 1.7 columns added by `V005__projects_full.sql`:
 * `project_code`, `project_type`, `division_id`, `chainage_*`, `length_km`,
 * `recommended_by_board_on`, `target_completion_year`, `lifecycle_state`,
 * `metadata_json`, `created_by_user_id`, `updated_by_user_id`,
 * `deleted_at`, `deleted_by_user_id`.
 *
 * **`lifecycle_state`** is a denormalized cache of the current workflow state.
 * The workflow engine is the source of truth; [ProjectLifecycleSyncListener]
 * keeps this column in sync via JdbcTemplate after every transition.
 *
 * Rules (domain/CLAUDE.md):
 * - Identity by [id]; no `data class`.
 * - `@Version` for optimistic locking.
 * - Soft-delete via [isDeleted]; hard-delete never permitted.
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
    // ── Phase 1.7 business columns ────────────────────────────────────────────
    @Column(name = "project_code", length = 64)
    val projectCode: String? = null,
    @Column(name = "project_type", length = 64)
    val projectType: String? = null,
    @Column(name = "division_id")
    val divisionId: UUID? = null,
    @Column(name = "chainage_from_km", precision = 10, scale = 3)
    val chainageFromKm: BigDecimal? = null,
    @Column(name = "chainage_to_km", precision = 10, scale = 3)
    val chainageToKm: BigDecimal? = null,
    @Column(name = "length_km", precision = 10, scale = 3)
    val lengthKm: BigDecimal? = null,
    @Column(name = "ipa_date")
    val ipaDate: LocalDate? = null,
    @Column(name = "station_names")
    val stationNames: String? = null,
    @Column(name = "recommended_by_board_on")
    val recommendedByBoardOn: LocalDate? = null,
    @Column(name = "target_completion_year")
    val targetCompletionYear: Int? = null,
    /**
     * Denormalized cache of [workflow_instances.current_state.code] for fast
     * list queries. Updated by [ProjectLifecycleSyncListener] after every
     * workflow transition; do NOT update this directly.
     */
    @Column(name = "lifecycle_state", nullable = false, length = 32)
    val lifecycleState: String = "DRAFT",
    @Column(name = "created_by_user_id")
    val createdByUserId: UUID? = null,
    @Column(name = "updated_by_user_id")
    val updatedByUserId: UUID? = null,
    // ── Soft delete ───────────────────────────────────────────────────────────
    @Column(name = "is_deleted", nullable = false)
    val isDeleted: Boolean = false,
    @Column(name = "deleted_at")
    val deletedAt: Instant? = null,
    @Column(name = "deleted_by_user_id")
    val deletedByUserId: UUID? = null,
    // ── Audit timestamps ──────────────────────────────────────────────────────
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

    override fun toString(): String = "Project(id=$id, code=$projectCode, name=$name, state=$lifecycleState)"
}
