package `in`.gov.ir.pia.repository

import `in`.gov.ir.pia.domain.User
import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface UserRepository : JpaRepository<User, UUID> {
    fun findByIdAndIsActiveTrueAndIsDeletedFalse(id: UUID): User?

    fun findAllByIsActiveTrueAndIsDeletedFalseOrderByDesignationCodeAscNameAsc(): List<User>

    fun findAllByDesignationCodeAndIsActiveTrueAndIsDeletedFalseOrderByName(designationCode: String): List<User>

    fun findAllByDesignationCodeAndPrimaryZoneIdAndIsActiveTrueAndIsDeletedFalseOrderByName(
        designationCode: String,
        primaryZoneId: UUID,
    ): List<User>

    fun findAllByDesignationCodeInAndIsActiveTrueAndIsDeletedFalseOrderByName(designationCodes: Collection<String>): List<User>

    fun findAllByDesignationCodeInAndPrimaryZoneIdAndIsActiveTrueAndIsDeletedFalseOrderByName(
        designationCodes: Collection<String>,
        primaryZoneId: UUID,
    ): List<User>
}
