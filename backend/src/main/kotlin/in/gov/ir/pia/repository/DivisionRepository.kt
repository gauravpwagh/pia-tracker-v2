package `in`.gov.ir.pia.repository

import `in`.gov.ir.pia.domain.Division
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
interface DivisionRepository : JpaRepository<Division, UUID> {
    fun findAllByZoneIdAndIsActiveTrueOrderByDisplayOrder(zoneId: UUID): List<Division>

    fun findAllByIsActiveTrueOrderByDisplayOrder(): List<Division>
}
