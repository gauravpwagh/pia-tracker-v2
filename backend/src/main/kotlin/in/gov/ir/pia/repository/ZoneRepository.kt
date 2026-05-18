package `in`.gov.ir.pia.repository

import `in`.gov.ir.pia.domain.Zone
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
interface ZoneRepository : JpaRepository<Zone, UUID> {
    fun findByCode(code: String): Zone?

    fun findAllByIsActiveTrueOrderByDisplayOrder(): List<Zone>
}
