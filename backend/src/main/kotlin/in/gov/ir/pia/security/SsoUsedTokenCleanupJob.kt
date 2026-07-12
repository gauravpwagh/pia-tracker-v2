package `in`.gov.ir.pia.security

import `in`.gov.ir.pia.repository.SsoUsedTokenRepository
import org.slf4j.LoggerFactory
import org.springframework.context.annotation.Profile
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import java.time.Instant

/**
 * Prunes [SsoUsedToken] rows once their token would no longer pass expiry validation
 * anyway — otherwise the replay-guard table grows forever. Runs hourly; a token that's
 * long expired carries no replay risk, so there's no reason to keep the row.
 */
@Component
@Profile("dev", "beta")
class SsoUsedTokenCleanupJob(
    private val ssoUsedTokenRepository: SsoUsedTokenRepository,
) {
    private val log = LoggerFactory.getLogger(SsoUsedTokenCleanupJob::class.java)

    @Scheduled(fixedDelayString = "PT1H", initialDelayString = "PT5M")
    @Transactional
    fun cleanExpired() {
        val deleted = ssoUsedTokenRepository.deleteByExpiresAtBefore(Instant.now())
        if (deleted > 0) {
            log.info("SSO replay-guard cleanup: removed {} expired token row(s)", deleted)
        }
    }
}
