package `in`.gov.ir.pia.audit

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component
import java.security.MessageDigest
import java.time.Instant
import java.util.UUID

/**
 * JDBC-based writer for the append-only `audit_log` table.
 *
 * Uses [JdbcTemplate] because the audit_log is a range-partitioned table;
 * Hibernate cannot use a standard `@Entity` mapping against partitioned tables
 * when the partition key is part of the primary key (Postgres constraint).
 *
 * ## Hash chain
 * [row_hash] is a SHA-256 of the row's canonical fields (action + entityType +
 * entityId + actorUserId + at).  The hash chain integrity job (Phase 3) will
 * verify that consecutive hashes link correctly.  For Phase 1.7 [prevHash] is
 * always null — the chain is left open and will be wired in a later phase.
 *
 * ## Partitions
 * Partitions `audit_log_2026_05`, `audit_log_2026_06`, `audit_log_2026_07`
 * were created by `V001__initial_schema.sql` and cover the current period.
 * New partitions must be added before the monthly boundary.
 */
@Component
class AuditLogWriter(
    private val jdbc: JdbcTemplate,
    private val objectMapper: ObjectMapper,
) {
    /**
     * Writes a single audit row.
     *
     * @param actorUserId   null only for system-generated events
     * @param action        verb code — e.g. "PROJECT.CREATE", "PROJECT.ALLOCATE"
     * @param entityType    e.g. "PROJECT", "ACTIVITY_RECORD"
     * @param entityId      PK of the affected row
     * @param beforeJson    snapshot before the change, or null for creates
     * @param afterJson     snapshot after the change, or null for deletes
     */
    fun write(
        actorUserId: UUID?,
        action: String,
        entityType: String,
        entityId: UUID?,
        beforeJson: JsonNode? = null,
        afterJson: JsonNode? = null,
    ) {
        val at = Instant.now()
        val rowHash = computeHash(action, entityType, entityId, actorUserId, at)

        jdbc.update(
            """
            INSERT INTO audit_log
                (actor_user_id, action, entity_type, entity_id,
                 before_json, after_json, row_hash, at)
            VALUES (?, ?, ?, ?, ?::jsonb, ?::jsonb, ?, ?)
            """.trimIndent(),
            actorUserId,
            action,
            entityType,
            entityId,
            beforeJson?.let { objectMapper.writeValueAsString(it) },
            afterJson?.let { objectMapper.writeValueAsString(it) },
            rowHash,
            java.sql.Timestamp.from(at),
        )
    }

    private fun computeHash(
        action: String,
        entityType: String,
        entityId: UUID?,
        actorUserId: UUID?,
        at: Instant,
    ): String {
        val input = "$action|$entityType|$entityId|$actorUserId|${at.toEpochMilli()}"
        val digest = MessageDigest.getInstance("SHA-256")
        return digest
            .digest(input.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
    }
}
