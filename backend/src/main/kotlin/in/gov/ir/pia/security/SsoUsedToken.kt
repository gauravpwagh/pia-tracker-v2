package `in`.gov.ir.pia.security

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import jakarta.persistence.Transient
import org.springframework.data.domain.Persistable
import java.time.Instant

/**
 * Replay-guard row for the SSO handoff — see [SsoTokenVerifier]. `tokenHash` is the
 * SHA-256 hex digest of the raw JWT (never the raw token itself). The primary key
 * constraint is what actually enforces one-time use: a second insert attempt for the
 * same hash throws a constraint violation, which [SsoTokenVerifier] treats as a replay.
 *
 * Implements [Persistable] with `isNew() = true` always: this entity is assigned its
 * own `@Id` (the hash) rather than a generated one, and it is only ever inserted, never
 * updated. Without this, Spring Data JPA's default "is this new?" check treats a
 * manually-assigned, non-null id as "existing", so `save()` calls `merge()` (an
 * upsert) instead of `persist()` (insert-only) — silently *updating* the row on a
 * repeat token instead of throwing a constraint violation, defeating replay detection
 * entirely.
 */
@Entity
@Table(name = "sso_used_token")
class SsoUsedToken(
    @Id
    @Column(name = "token_hash")
    val tokenHash: String,
    @Column(name = "expires_at", nullable = false)
    val expiresAt: Instant,
    @Column(name = "created_at", updatable = false)
    val createdAt: Instant = Instant.now(),
) : Persistable<String> {
    @Transient
    override fun getId(): String = tokenHash

    @Transient
    override fun isNew(): Boolean = true

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is SsoUsedToken) return false
        return tokenHash == other.tokenHash
    }

    override fun hashCode(): Int = tokenHash.hashCode()
}
