package `in`.gov.ir.pia.api

import `in`.gov.ir.pia.security.PiaPrincipal
import `in`.gov.ir.pia.workflow.BulkTransitionRequest
import `in`.gov.ir.pia.workflow.BulkTransitionResponse
import `in`.gov.ir.pia.workflow.BulkTransitionService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.responses.ApiResponses
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

// ── Response types ─────────────────────────────────────────────────────────────

/**
 * A single item in the workflow inbox — one workflow instance that requires
 * action from the current user (or is in progress / SLA-breached).
 *
 * [entityType] is `"ACTIVITY_RECORD"` for record/section-level items (the
 * original shape — [recordId], [activityName], [activityTypeCode] populated)
 * or `"PROJECT"` for project-lifecycle approval gates (CAO/C allocation,
 * CE/C Dy CE/C assignment, EDGS/C-I submission) — those three fields are
 * null since there's no record/activity involved yet.
 */
data class InboxItem(
    val instanceId: UUID,
    val entityType: String,
    val recordId: UUID?,
    val sectionCode: String?,
    val projectId: UUID,
    /** Nullable — project_code is populated lazily and may be null for older rows. Fall back to [projectId] to navigate. */
    val projectCode: String?,
    val projectName: String,
    val activityName: String?,
    val activityTypeCode: String?,
    /** User-supplied record display name; null for record types that don't use one (e.g. Land Acquisition). Null for PROJECT items. */
    val recordName: String?,
    /** e.g. a drawing's subtype (ESP, SIP, ...); null when the record type has none, or for PROJECT items. */
    val recordSubtype: String?,
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
 * matches one of the caller's role codes, scoped to the SAME project visibility
 * rules as the Projects list (see [projectScopeClause]) — ALL/ZONE/OWN, matching
 * [in.gov.ir.pia.service.project.ProjectService.listForPrincipal] exactly, so the
 * Inbox never shows a project a user couldn't otherwise see or open. Covers both
 * record/section-level instances (`entity_type = 'ACTIVITY_RECORD'`) and
 * project-lifecycle instances (`entity_type = 'PROJECT'`) — the latter is how
 * CAO/C project-allocation and CE/C Dy-CE/C-assignment gates surface here.
 * Record/section-level items are one row per **record**, not per section —
 * see [buildAwaitingItems].
 *
 * **In progress:** instances for records created by the caller that are no
 * longer in `DRAFT` but not yet `AUTHENTICATED` — i.e. the user submitted
 * something that is being reviewed upstream.
 *
 * **SLA breached:** subset of "awaiting your action" where
 * `now() - entered_state_at > sla_days * 24 h`.
 */
@RestController
@Tag(name = "Workflow", description = "Workflow inbox and bulk-transition endpoints")
class WorkflowController(
    private val namedJdbc: NamedParameterJdbcTemplate,
    private val bulkTransitionService: BulkTransitionService,
) {
    // ── Bulk transition ───────────────────────────────────────────────────────

    /**
     * Applies a single workflow action to multiple activity records in one call.
     *
     * Each record is transitioned independently — a failure on one does NOT roll
     * back successful earlier transitions.  The [BulkTransitionResponse] details
     * per-record success / failure.
     *
     * Each successful transition writes an audit log row (via [WorkflowAuditListener]).
     * 5 records authenticated → 5 `WORKFLOW.AUTHENTICATED` audit entries.
     *
     * Role enforcement (e.g. authenticate requires ROLE_CE_C) is applied per record
     * by the workflow engine. An actor lacking the required role will get failures
     * for every record.
     *
     * Limited to 50 records per call to prevent runaway commits.
     */
    @PostMapping("/api/v1/workflow/bulk-transition")
    @ResponseStatus(HttpStatus.OK)
    @PreAuthorize("@pe.hasPermission(authentication, null, 'ACTIVITY_RECORD.BULK_TRANSITION')")
    @Operation(
        summary = "Bulk workflow transition",
        description =
            "Applies a single workflow action (e.g. 'authenticate') to up to 50 activity records. " +
                "Each record is transitioned independently; per-record results are returned. " +
                "Each successful transition writes an audit log row. " +
                "Action code is normalised to lowercase before dispatch. " +
                "Gated to ACTIVITY_RECORD.BULK_TRANSITION.",
    )
    @ApiResponses(
        ApiResponse(responseCode = "200", description = "Batch processed (check per-record results for failures)"),
        ApiResponse(responseCode = "400", description = "recordIds empty or exceeds limit"),
        ApiResponse(responseCode = "403", description = "Insufficient permission"),
    )
    fun bulkTransition(
        @RequestBody request: BulkTransitionRequest,
        @AuthenticationPrincipal principal: PiaPrincipal,
    ): BulkTransitionResponse = bulkTransitionService.bulkTransition(request, principal)

    // ── Inbox ─────────────────────────────────────────────────────────────────

    @GetMapping("/api/v1/workflow/inbox")
    @PreAuthorize("isAuthenticated()")
    fun inbox(
        @AuthenticationPrincipal principal: PiaPrincipal,
    ): InboxResponse {
        val awaiting =
            (buildAwaitingItems(principal) + buildProjectAwaitingItems(principal))
                .sortedByDescending { it.daysPending }
        val inProgress = buildInProgressItems(principal)
        return InboxResponse(
            awaiting = awaiting,
            inProgress = inProgress,
            slaBreached = awaiting.filter { it.isSlaBreached },
        )
    }

    // ── Private query helpers ─────────────────────────────────────────────────

    /**
     * Project visibility scope, mirroring
     * [in.gov.ir.pia.service.project.ProjectService.listForPrincipal] exactly —
     * the Inbox must never show more than the Projects list would for the same
     * user, so the two stay in lockstep:
     *
     *   - **ALL** (super admin or `PROJECT.READ.ALL`) → no filter, every project.
     *   - **ZONE** (`PROJECT.READ.ZONE`) → `p.zone_id` in the caller's accessible zones.
     *   - **OWN** (neither — e.g. CE/C, Dy CE/C, Nodal Dy CE/C) → `p` has an active
     *     row in `project_assignments` for this user. Notably narrower than "zone" —
     *     these roles see only projects they're actually assigned to, not every
     *     project their zone happens to contain.
     *
     * Adds any needed bind variables to [params] and returns the SQL fragment
     * (empty, or an `AND ...` clause) to splice into a query filtering `projects p`.
     */
    private fun projectScopeClause(
        principal: PiaPrincipal,
        params: MutableMap<String, Any>,
    ): String =
        when {
            principal.isSuperAdmin || principal.permissions.contains("PROJECT.READ.ALL") -> ""

            principal.permissions.contains("PROJECT.READ.ZONE") -> {
                params["zoneIds"] = principal.accessibleZoneIds.map { it.toString() }.toList()
                "AND p.zone_id = ANY(ARRAY[ :zoneIds ]::uuid[])"
            }

            else -> {
                params["assignedUserId"] = principal.userId
                """
                AND EXISTS (
                    SELECT 1 FROM project_assignments pa_scope
                     WHERE pa_scope.project_id = p.id
                       AND pa_scope.user_id = :assignedUserId
                       AND pa_scope.is_active = true
                )
                """.trimIndent()
            }
        }

    /**
     * Instances whose current state requires a role the caller holds — one
     * row per **record**, not per section.
     *
     * Section-level activities (e.g. Land Acquisition) run one
     * `workflow_instance` per section, so a single record can have several
     * instances simultaneously requiring the same role (e.g. 9+ sections all
     * in DRAFT). Without collapsing, a Dy CE/C would see one inbox row per
     * *section* rather than per record. `DISTINCT ON (wi.entity_id)` picks
     * the earliest-entered instance per record — the longest-waiting section
     * — so daysPending/SLA reflect the oldest outstanding item and the
     * displayed section is the one that's been pending longest. Record-level
     * activities (a single, section_code-less instance per record) pass
     * through unchanged since there's only one row per entity_id anyway.
     *
     * Scoped per [projectScopeClause] — the same ALL/ZONE/OWN rules as the
     * Projects list.
     */
    private fun buildAwaitingItems(principal: PiaPrincipal): List<InboxItem> {
        val params =
            mutableMapOf<String, Any>(
                "roleCodes" to principal.roleCodes.toList(),
            )
        val scopeClause = projectScopeClause(principal, params)
        val sql =
            """
            SELECT * FROM (
                SELECT DISTINCT ON (wi.entity_id)
                    wi.id                                                       AS instance_id,
                    wi.entity_id                                                AS record_id,
                    wi.section_code,
                    p.id                                                        AS project_id,
                    p.project_code,
                    p.name                                                      AS project_name,
                    pa.name                                                     AS activity_name,
                    pa.activity_type_code,
                    ar.name                                                     AS record_name,
                    ar.record_subtype,
                    ws.code                                                     AS state_code,
                    ws.label                                                    AS state_label,
                    wi.entered_state_at,
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
                  $scopeClause
                ORDER BY wi.entity_id, wi.entered_state_at ASC
            ) per_record
            ORDER BY entered_state_at ASC
            LIMIT 200
            """.trimIndent()
        return namedJdbc.query(sql, params) { rs, _ ->
            InboxItem(
                instanceId = UUID.fromString(rs.getString("instance_id")),
                entityType = "ACTIVITY_RECORD",
                recordId = UUID.fromString(rs.getString("record_id")),
                sectionCode = rs.getString("section_code"),
                projectId = UUID.fromString(rs.getString("project_id")),
                projectCode = rs.getString("project_code"),
                projectName = rs.getString("project_name"),
                activityName = rs.getString("activity_name"),
                activityTypeCode = rs.getString("activity_type_code"),
                recordName = rs.getString("record_name"),
                recordSubtype = rs.getString("record_subtype"),
                stateCode = rs.getString("state_code"),
                stateLabel = rs.getString("state_label"),
                daysPending = rs.getInt("days_pending"),
                isSlaBreached = rs.getBoolean("is_sla_breached"),
            )
        }
    }

    /**
     * Project-lifecycle instances whose current state requires a role the
     * caller holds — CAO/C's "awaiting allocation", CE/C's "awaiting Dy CE/C
     * assignment", EDGS/C-I's "draft awaiting submission", etc. These live on
     * `entity_type = 'PROJECT'` workflow instances, joined straight to
     * `projects` since there's no activity/record underneath yet. Scoped per
     * [projectScopeClause] — note that by the time a project reaches
     * `AWAITING_CEC_ASSIGNMENT`, `allocate()` has already created the CE/C's
     * `project_assignments` row, so OWN-scope CE/Cs correctly see their gate.
     */
    private fun buildProjectAwaitingItems(principal: PiaPrincipal): List<InboxItem> {
        val params =
            mutableMapOf<String, Any>(
                "roleCodes" to principal.roleCodes.toList(),
            )
        val scopeClause = projectScopeClause(principal, params)
        val sql =
            """
            SELECT
                wi.id                                                       AS instance_id,
                p.id                                                        AS project_id,
                p.project_code,
                p.name                                                      AS project_name,
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
            JOIN projects p ON p.id = wi.entity_id AND p.is_deleted = false
            WHERE wi.entity_type = 'PROJECT'
              AND ws.is_terminal = false
              AND ws.role_required_code = ANY(ARRAY[ :roleCodes ])
              $scopeClause
            ORDER BY wi.entered_state_at ASC
            LIMIT 200
            """.trimIndent()
        return namedJdbc.query(sql, params) { rs, _ ->
            InboxItem(
                instanceId = UUID.fromString(rs.getString("instance_id")),
                entityType = "PROJECT",
                recordId = null,
                sectionCode = null,
                projectId = UUID.fromString(rs.getString("project_id")),
                projectCode = rs.getString("project_code"),
                projectName = rs.getString("project_name"),
                activityName = null,
                activityTypeCode = null,
                recordName = null,
                recordSubtype = null,
                stateCode = rs.getString("state_code"),
                stateLabel = rs.getString("state_label"),
                daysPending = rs.getInt("days_pending"),
                isSlaBreached = rs.getBoolean("is_sla_breached"),
            )
        }
    }

    /**
     * Instances for records the caller created that are beyond DRAFT but not
     * yet AUTHENTICATED — i.e. the caller submitted something being reviewed
     * upstream. Scoped per [projectScopeClause] — the same ALL/ZONE/OWN rules
     * as the Projects list (on top of the `created_by_user_id` filter already
     * limiting this to the caller's own records).
     */
    private fun buildInProgressItems(principal: PiaPrincipal): List<InboxItem> {
        val params =
            mutableMapOf<String, Any>(
                "userId" to principal.userId,
            )
        val scopeClause = projectScopeClause(principal, params)
        val sql =
            """
            SELECT
                wi.id                                                       AS instance_id,
                wi.entity_id                                                AS record_id,
                wi.section_code,
                p.id                                                        AS project_id,
                p.project_code,
                p.name                                                      AS project_name,
                pa.name                                                     AS activity_name,
                pa.activity_type_code,
                ar.name                                                     AS record_name,
                ar.record_subtype,
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
              $scopeClause
            ORDER BY wi.entered_state_at ASC
            LIMIT 200
            """.trimIndent()
        return namedJdbc.query(sql, params) { rs, _ ->
            InboxItem(
                instanceId = UUID.fromString(rs.getString("instance_id")),
                entityType = "ACTIVITY_RECORD",
                recordId = UUID.fromString(rs.getString("record_id")),
                sectionCode = rs.getString("section_code"),
                projectId = UUID.fromString(rs.getString("project_id")),
                projectCode = rs.getString("project_code"),
                projectName = rs.getString("project_name"),
                activityName = rs.getString("activity_name"),
                activityTypeCode = rs.getString("activity_type_code"),
                recordName = rs.getString("record_name"),
                recordSubtype = rs.getString("record_subtype"),
                stateCode = rs.getString("state_code"),
                stateLabel = rs.getString("state_label"),
                daysPending = rs.getInt("days_pending"),
                isSlaBreached = false,
            )
        }
    }
}
