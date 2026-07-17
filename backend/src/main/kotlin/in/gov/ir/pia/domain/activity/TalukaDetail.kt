package `in`.gov.ir.pia.domain.activity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import jakarta.persistence.Version
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

/**
 * One Sub-Division/Taluka within a Land Acquisition activity, carrying the SRP
 * and CALA gazette details for that taluka.
 *
 * Entered once per taluka here instead of per record — Land Acquisition
 * [ActivityRecord]s reference a row by name
 * (`acquisition_details.sub_division_taluka`) and fetch these fields
 * read-only rather than editing their own copy.
 *
 * Gazette PDFs are not columns here — same convention as the activity Scope
 * checklist: the frontend uses the generic attachment mechanism, keyed by
 * entityType `ACTIVITY_TALUKA__srp_gazette` / `ACTIVITY_TALUKA__cala_gazette`
 * with entityId = this row's [id].
 */
@Entity
@Table(name = "activity_taluka_details")
class TalukaDetail(
    @Id
    val id: UUID = UUID.randomUUID(),
    @Column(name = "project_activity_id", nullable = false)
    val projectActivityId: UUID,
    @Column(name = "taluka_name", nullable = false, length = 128)
    val talukaName: String,

    @Column(name = "srp_declared_in_gaz_on")
    val srpDeclaredInGazOn: LocalDate? = null,
    @Column(name = "srp_gazette_published_on")
    val srpGazettePublishedOn: LocalDate? = null,
    @Column(name = "srp_gazette_number", length = 64)
    val srpGazetteNumber: String? = null,

    @Column(name = "cala_received_from_state_on")
    val calaReceivedFromStateOn: LocalDate? = null,
    @Column(name = "cala_gazette_published_on")
    val calaGazettePublishedOn: LocalDate? = null,
    @Column(name = "cala_gazette_number", length = 64)
    val calaGazetteNumber: String? = null,

    /** Once true (via "Create"), the taluka can no longer be edited or deleted. */
    @Column(name = "is_finalized", nullable = false)
    val isFinalized: Boolean = false,

    @Column(name = "created_by_user_id", nullable = false)
    val createdByUserId: UUID,
    @Column(name = "updated_by_user_id")
    val updatedByUserId: UUID? = null,

    @Column(name = "is_deleted", nullable = false)
    val isDeleted: Boolean = false,
    @Column(name = "deleted_at")
    val deletedAt: Instant? = null,
    @Column(name = "deleted_by_user_id")
    val deletedByUserId: UUID? = null,

    @Column(name = "created_at", nullable = false, updatable = false)
    val createdAt: Instant = Instant.now(),
    @Column(name = "updated_at", nullable = false)
    val updatedAt: Instant = Instant.now(),
    @Version
    val version: Int = 0,
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is TalukaDetail) return false
        return id == other.id
    }

    override fun hashCode(): Int = id.hashCode()

    override fun toString(): String = "TalukaDetail(id=$id, projectActivityId=$projectActivityId, talukaName=$talukaName)"
}
