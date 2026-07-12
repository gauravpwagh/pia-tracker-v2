package `in`.gov.ir.pia.service.auth

import `in`.gov.ir.pia.domain.User
import `in`.gov.ir.pia.repository.UserRepository
import org.springframework.http.HttpStatus
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import java.time.Instant
import java.util.UUID

/**
 * Fallback username+password login (used when SSO is unavailable).
 *
 * The **initial** password is the user's HRMS id (`employee_id`). `password_hash`
 * starts NULL; the first successful login hashes the HRMS id with BCrypt and stores
 * it (lazy initialisation), so there is no bulk backfill. After that — and after any
 * self-service change — this holds the BCrypt hash of the user's chosen password.
 *
 * Security note (accepted by the product owner): using the HRMS id as the initial
 * password means the identifier and the secret are the same public value until the
 * user changes it. This path is a standalone fallback; SSO remains the primary login.
 */
@Service
class PasswordAuthService(
    private val userRepository: UserRepository,
    private val passwordEncoder: PasswordEncoder,
) {
    companion object {
        const val MIN_PASSWORD_LENGTH = 6
    }

    /**
     * Verifies credentials and returns the user. Username may be the HRMS id or email.
     * Throws 401 with a generic message on any failure (never reveals which field was wrong).
     */
    @Transactional
    fun login(username: String, rawPassword: String): User {
        val user = findByUsername(username) ?: throw invalidCredentials()

        val hash = user.passwordHash
        if (hash == null) {
            // Lazy init: the initial password is the HRMS id. Match → persist the hash.
            val initial = user.employeeId ?: throw invalidCredentials()
            if (rawPassword != initial) throw invalidCredentials()
            user.passwordHash = passwordEncoder.encode(rawPassword)
            user.passwordUpdatedAt = Instant.now()
        } else if (!passwordEncoder.matches(rawPassword, hash)) {
            throw invalidCredentials()
        }

        user.lastLoginAt = Instant.now()
        return userRepository.save(user)
    }

    /** Self-service password change. Verifies the current password before setting the new one. */
    @Transactional
    fun changePassword(userId: UUID, currentPassword: String, newPassword: String) {
        val user =
            userRepository.findByIdAndIsActiveTrueAndIsDeletedFalse(userId)
                ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "No active session")

        val currentOk =
            when (val hash = user.passwordHash) {
                null -> currentPassword == user.employeeId // still on the initial HRMS-id password
                else -> passwordEncoder.matches(currentPassword, hash)
            }
        if (!currentOk) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Current password is incorrect")
        }
        if (newPassword.length < MIN_PASSWORD_LENGTH) {
            throw ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "New password must be at least $MIN_PASSWORD_LENGTH characters",
            )
        }

        user.passwordHash = passwordEncoder.encode(newPassword)
        user.passwordUpdatedAt = Instant.now()
        userRepository.save(user)
    }

    private fun findByUsername(username: String): User? {
        val u = username.trim()
        return userRepository.findByEmployeeIdAndIsActiveTrueAndIsDeletedFalse(u)
            ?: userRepository.findByEmailIgnoreCaseAndIsActiveTrueAndIsDeletedFalse(u)
    }

    private fun invalidCredentials() =
        ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid username or password")
}
