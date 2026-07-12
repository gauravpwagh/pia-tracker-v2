package `in`.gov.ir.pia.repository

import `in`.gov.ir.pia.security.SsoUsedToken
import org.springframework.data.jpa.repository.JpaRepository
import java.time.Instant

interface SsoUsedTokenRepository : JpaRepository<SsoUsedToken, String> {
    /** Prunes rows whose token would no longer be accepted anyway. */
    fun deleteByExpiresAtBefore(cutoff: Instant): Long
}
