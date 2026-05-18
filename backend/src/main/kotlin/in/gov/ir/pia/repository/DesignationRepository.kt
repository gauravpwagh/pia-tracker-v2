package `in`.gov.ir.pia.repository

import `in`.gov.ir.pia.domain.Designation
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository

@Repository
interface DesignationRepository : JpaRepository<Designation, String> {
    fun findAllByOrderByDisplayOrder(): List<Designation>

    fun findAllByIsApprovalRoleTrueOrderByDisplayOrder(): List<Designation>

    fun findAllByIsDataEntryRoleTrueOrderByDisplayOrder(): List<Designation>
}
