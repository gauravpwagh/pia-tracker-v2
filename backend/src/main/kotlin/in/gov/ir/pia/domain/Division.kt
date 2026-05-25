package `in`.gov.ir.pia.domain

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "divisions")
class Division(
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    val id: UUID = UUID.randomUUID(),
    @Column(name = "zone_id", nullable = false)
    val zoneId: UUID,
    @Column(nullable = false, length = 16)
    val code: String,
    @Column(nullable = false, length = 128)
    val name: String,
    @Column(name = "display_order")
    val displayOrder: Int = 0,
    @Column(name = "is_active")
    val isActive: Boolean = true,
    @Column(name = "created_at", updatable = false)
    val createdAt: Instant = Instant.now(),
    @Column(name = "updated_at")
    var updatedAt: Instant = Instant.now(),
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is Division) return false
        return id == other.id
    }

    override fun hashCode(): Int = id.hashCode()
}
