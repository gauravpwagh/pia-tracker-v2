package `in`.gov.ir.pia.security

import `in`.gov.ir.pia.repository.SsoUsedTokenRepository
import com.nimbusds.jose.crypto.MACVerifier
import com.nimbusds.jwt.JWTClaimsSet
import com.nimbusds.jwt.SignedJWT
import org.slf4j.LoggerFactory
import org.springframework.context.annotation.Profile
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import org.springframework.web.server.ResponseStatusException
import java.security.MessageDigest
import java.time.Duration
import java.time.Instant

/**
 * Verifies the HS256 SSO handoff token from the partner system: signature, expiry,
 * clock skew, max lifetime, and single-use (replay protection via [SsoUsedTokenRepository]
 * — the partner's tokens carry no `jti`, so we hash the raw token instead).
 *
 * Any verification failure throws 401 and is logged with a reason code (never the raw
 * token or the shared secret) so a rejected login can be diagnosed from the app logs
 * alone. Callers map a valid-but-unknown user to 403.
 */
@Component
@Profile("dev", "beta")
class SsoTokenVerifier(
    private val props: SsoProperties,
    private val ssoUsedTokenRepository: SsoUsedTokenRepository,
) {
    private val log = LoggerFactory.getLogger(SsoTokenVerifier::class.java)
    private val skew: Duration = Duration.ofSeconds(props.clockSkewSeconds)
    private val secretBytes = props.secret.toByteArray(Charsets.UTF_8)

    fun verify(token: String): JWTClaimsSet {
        val jwt = runCatching { SignedJWT.parse(token) }.getOrElse { reject("MALFORMED") }

        if (!runCatching { jwt.verify(MACVerifier(secretBytes)) }.getOrDefault(false)) {
            reject("SIGNATURE_INVALID")
        }

        val claims = jwt.jwtClaimsSet
        val sub = claims.subject
        val now = Instant.now()

        val exp = claims.expirationTime?.toInstant() ?: reject("MISSING_CLAIM_EXP", sub)
        if (exp.isBefore(now.minus(skew))) reject("EXPIRED", sub)

        val iat = claims.issueTime?.toInstant() ?: reject("MISSING_CLAIM_IAT", sub)
        if (iat.isAfter(now.plus(skew))) reject("ISSUED_IN_FUTURE", sub)

        if (Duration.between(iat, exp) > Duration.ofSeconds(props.maxTokenLifetimeSeconds)) {
            reject("LIFETIME_TOO_LONG", sub)
        }

        if (sub.isNullOrBlank()) reject("MISSING_CLAIM_SUB")

        consumeToken(token, exp, sub)

        log.info("SSO token verified: sub={}", sub)
        return claims
    }

    /** Records a one-time token hash; rejects (401, REPLAY) if it was already used. */
    private fun consumeToken(token: String, expiry: Instant, sub: String) {
        val hash = sha256Hex(token)
        try {
            ssoUsedTokenRepository.saveAndFlush(SsoUsedToken(hash, expiry.plus(skew)))
        } catch (e: DataIntegrityViolationException) {
            reject("REPLAY", sub)
        }
    }

    private fun sha256Hex(value: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8))
        return digest.joinToString("") { "%02x".format(it) }
    }

    /** Logs the reason code (and sub, if already known) before rejecting with 401. Never logs the raw token or secret. */
    private fun reject(reasonCode: String, sub: String? = null): Nothing {
        log.warn("SSO token rejected: reason={} sub={}", reasonCode, sub ?: "-")
        throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "SSO token rejected: $reasonCode")
    }
}
