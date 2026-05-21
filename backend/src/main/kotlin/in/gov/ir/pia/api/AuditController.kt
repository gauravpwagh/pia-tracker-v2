package `in`.gov.ir.pia.api

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.time.Instant
import java.util.UUID

data class AuditLogEntryDto(
    val id: UUID,
    val actorUserId: UUID?,
    val action: String,
    val entityType: String,
    val entityId: UUID?,
    val at: Instant,
)

/**
 * Read-only audit log endpoint.
 *
 *   GET /api/v1/audit?entityType=X&entityId=Y — list audit entries for an entity
 *
 * AUDIT_LOG.READ.OWN allows reading entries for entities the user has access to.
 * AUDIT_LOG.READ.ALL (admin) allows unrestricted queries.
 *
 * For Phase 1, the endpoint returns the last 200 entries for the specified entity.
 * Full pagination and cross-entity queries are Phase 3.
 */
@RestController
class AuditController(
    private val jdbc: JdbcTemplate,
) {
    // Phase 1: access-control is enforced by @PreAuthorize; no record-level
    // filtering needed yet. The principal parameter will be re-introduced in
    // Phase 2 when per-entity zone filtering is added.
    @GetMapping("/api/v1/audit")
    @PreAuthorize(
        "@pe.hasPermission(authentication, null, 'AUDIT_LOG.READ.OWN') or " +
            "@pe.hasPermission(authentication, null, 'AUDIT_LOG.READ.ALL')",
    )
    fun list(
        @RequestParam entityType: String,
        @RequestParam entityId: UUID,
    ): List<AuditLogEntryDto> =
        jdbc.query(
            """
            SELECT id, actor_user_id, action, entity_type, entity_id, at
            FROM audit_log
            WHERE entity_type = ? AND entity_id = ?
            ORDER BY at DESC
            LIMIT 200
            """.trimIndent(),
            { rs, _ ->
                AuditLogEntryDto(
                    id = UUID.fromString(rs.getString("id")),
                    actorUserId = rs.getString("actor_user_id")?.let { UUID.fromString(it) },
                    action = rs.getString("action"),
                    entityType = rs.getString("entity_type"),
                    entityId = rs.getString("entity_id")?.let { UUID.fromString(it) },
                    at = rs.getTimestamp("at").toInstant(),
                )
            },
            entityType,
            entityId,
        )
}
