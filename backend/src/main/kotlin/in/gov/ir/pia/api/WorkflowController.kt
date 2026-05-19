package `in`.gov.ir.pia.api

import `in`.gov.ir.pia.security.PiaPrincipal
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController
import java.time.Instant
import java.util.UUID

// ── Response types ─────────────────────────────────────────────────────────────

/**
 * A single item in the workflow inbox — one workflow instance that requires
 * action from the current user (or is in progress / SLA-breached).
 */
data class InboxItem(
    val instanceId: UUID,
    val recordId: UUID,
    val sectionCode: String?,
    /** Nullable — project_code is populated lazily and may be null for older rows. */
    val projectCode: String?,
    val projectName: String,
    val activityName: String,
    val activityTypeCode: String,
    val stateCode: String,
    val stateLabel: String,
    /** Whole days since the instance entered its current state. */
    val daysPending: Int,
    val isSlaBreached: Boolean,
)

/**
 * Full inbox response split into three semantically distinct lists:
 *
 * - [awaiting]    items where the current user's role is required to act.
 * - [inProgress]  items the current user created/owns that have been submitted
 *                 and are being processed by others (not yet AUTHENTICATED).
 * - [slaBreached] subset of [awaiting] where the SLA has been exceeded.
 */
data class InboxResponse(
    val awaiting: List<InboxItem>,
    val inProgress: List<InboxItem>,
    val slaBreached: List<InboxItem>,
)

// ── Controller ─────────────────────────────────────────────────────────────────

/**
 * Workflow-level endpoints that don't fit under a specific activity/record
 * resource:
 *
 *   `GET /api/v1/workflow/inbox` — items pending the current user's action.
 *
 * ## Inbox semantics
 *
 * **Awaiting your action:** instances whose current [workflow_states.role_required_code]
 * matches one of the caller's role codes, scoped to the caller's accessible zones.
 *
 * **In progress:** instances for records created by the caller that are no
 * longer in `DRAFT` but not yet `AUTHENTICATED` — i.e. the user submitted
 * something that is being reviewed upstream.
 *
 * **SLA breached:** subset of "awaiting your action" where
 * `now() - entered_state_at > sla_days * 24 h`.
 */
@RestController
class WorkflowController(
    private val namedJdbc: NamedParameterJdbcTemplate,
) {
    // ── Inbox ─────────────────────────────────────────────────────────────────

    @GetMapping("/api/v1/workflow/inbox")
    @PreAuthorize("isAuthenticated()")
    fun inbox(
        @AuthenticationPrincipal principal: PiaPrincipal,
    ): InboxResponse {
        val skipZoneFilter =
            principal.isSuperAdmin ||
                principal.permissions.contains("PROJECT.READ.ALL")

        // ── Awaiting your action ──────────────────────────────────────────────
        //
        // Instances whose current state requires a role the caller holds.

        val awaitingParams = mutableMapOf<String, Any>(
            "roleCodes" to principal.roleCodes.toList(),
        )
        val awaitingZoneClause = if (skipZoneFilter) {
            ""
        } else {
            awaitingParams["zoneIds"] = principal.accessibleZoneIds.map { it.toString() }.toList()
            "AND p.zone_id = ANY(ARRAY[ :zoneIds ]::uuid[])"
        }

        val awaitingSql =
            """
            SELECT
                wi.id                                                       AS instance_id,
                wi.entity_id                                                AS record_id,
                wi.section_code,
                p.project_code,
                p.name                                                      AS project_name,
                pa.name                                                     AS activity_name,
                pa.activity_type_code,
                ws.code                                                     AS state_code,
                ws.label                                                    AS state_label,
                GREATEST(0,
                    FLOOR(EXTRACT(EPOCH FROM (now() - wi.entered_state_at))
                    / 86400)::int)                                          AS days_pending,
                CASE
                    WHEN ws.sla_days IS NOT NULL
                         AND EXTRACT(EPOCH FROM (now() - wi.entered_state_at))
                             > ws.sla_days * 86400
                    THEN true ELSE false
                END                                                         AS is_sla_breached
            FROM workflow_instances wi
            JOIN workflow_states ws ON ws.id = wi.current_state_id
            JOIN activity_records ar ON ar.id = wi.entity_id AND ar.is_deleted = false
            JOIN project_activities pa ON pa.id = ar.project_activity_id
            JOIN projects p ON p.id = pa.project_id AND p.is_deleted = false
            WHERE wi.entity_type = 'ACTIVITY_RECORD'
              AND ws.is_terminal = false
              AND ws.role_required_code = ANY(ARRAY[ :roleCodes ])
              $awaitingZoneClause
            ORDER BY wi.entered_state_at ASC
            LIMIT 200
            """.trimIndent()

        val awaiting = namedJdbc.query(awaitingSql, awaitingParams) { rs, _ ->
            InboxItem(
                instanceId = UUID.fromString(rs.getString("instance_id")),
                recordId = UUID.fromString(rs.getString("record_id")),
                sectionCode = rs.getString("section_code"),
                projectCode = rs.getString("project_code"),
                projectName = rs.getString("project_name"),
                activityName = rs.getString("activity_name"),
                activityTypeCode = rs.getString("activity_type_code"),
                stateCode = rs.getString("state_code"),
                stateLabel = rs.getString("state_label"),
                daysPending = rs.getInt("days_pending"),
                isSlaBreached = rs.getBoolean("is_sla_breached"),
            )
        }

        val slaBreached = awaiting.filter { it.isSlaBreached }

        // ── In progress ───────────────────────────────────────────────────────
        //
        // Instances for records the caller created that are beyond DRAFT but
        // not yet AUTHENTICATED (i.e. the caller submitted something and it
        // is being reviewed upstream).

        val inProgressParams = mutableMapOf<String, Any>(
            "userId" to principal.userId,
        )
        val inProgressZoneClause = if (skipZoneFilter) {
            ""
        } else {
            inProgressParams["zoneIds"] = principal.accessibleZoneIds.map { it.toString() }.toList()
            "AND p.zone_id = ANY(ARRAY[ :zoneIds ]::uuid[])"
        }

        val inProgressSql =
            """
            SELECT
                wi.id                                                       AS instance_id,
                wi.entity_id                                                AS record_id,
                wi.section_code,
                p.project_code,
                p.name                                                      AS project_name,
                pa.name                                                     AS activity_name,
                pa.activity_type_code,
                ws.code                                                     AS state_code,
                ws.label                                                    AS state_label,
                GREATEST(0,
                    FLOOR(EXTRACT(EPOCH FROM (now() - wi.entered_state_at))
                    / 86400)::int)                                          AS days_pending,
                false                                                       AS is_sla_breached
            FROM workflow_instances wi
            JOIN workflow_states ws ON ws.id = wi.current_state_id
            JOIN activity_records ar ON ar.id = wi.entity_id
                 AND ar.is_deleted = false
                 AND ar.created_by_user_id = :userId
            JOIN project_activities pa ON pa.id = ar.project_activity_id
            JOIN projects p ON p.id = pa.project_id AND p.is_deleted = false
            WHERE wi.entity_type = 'ACTIVITY_RECORD'
              AND ws.code NOT IN ('DRAFT', 'AUTHENTICATED')
              AND ws.is_terminal = false
              $inProgressZoneClause
            ORDER BY wi.entered_state_at ASC
            LIMIT 200
            """.trimIndent()

        val inProgress = namedJdbc.query(inProgressSql, inProgressParams) { rs, _ ->
            InboxItem(
                instanceId = UUID.fromString(rs.getString("instance_id")),
                recordId = UUID.fromString(rs.getString("record_id")),
                sectionCode = rs.getString("section_code"),
                projectCode = rs.getString("project_code"),
                projectName = rs.getString("project_name"),
                activityName = rs.getString("activity_name"),
                activityTypeCode = rs.getString("activity_type_code"),
                stateCode = rs.getString("state_code"),
                stateLabel = rs.getString("state_label"),
                daysPending = rs.getInt("days_pending"),
                isSlaBreached = false,
            )
        }

        return InboxResponse(
            awaiting = awaiting,
            inProgress = inProgress,
            slaBreached = slaBreached,
        )
    }
}
