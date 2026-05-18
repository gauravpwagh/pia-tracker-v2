package `in`.gov.ir.pia.domain

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant

@Entity
@Table(name = "designations")
class Designation(
    @Id
    val code: String,
    @Column(nullable = false)
    val name: String,
    @Column(name = "short_label", nullable = false)
    val shortLabel: String,
    @Column(nullable = false)
    val category: String,
    @Column(name = "is_approval_role")
    val isApprovalRole: Boolean = false,
    @Column(name = "is_data_entry_role")
    val isDataEntryRole: Boolean = false,
    @Column(name = "display_order")
    val displayOrder: Int = 0,
    val description: String? = null,
    @Column(name = "created_at", updatable = false)
    val createdAt: Instant = Instant.now(),
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is Designation) return false
        return code == other.code
    }

    override fun hashCode(): Int = code.hashCode()
}
