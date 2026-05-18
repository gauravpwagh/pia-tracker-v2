package `in`.gov.ir.pia.repository

import `in`.gov.ir.pia.domain.User
import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface UserRepository : JpaRepository<User, UUID> {
    fun findByIdAndIsActiveTrueAndIsDeletedFalse(id: UUID): User?

    fun findAllByIsActiveTrueAndIsDeletedFalseOrderByDesignationCodeAscNameAsc(): List<User>
}
