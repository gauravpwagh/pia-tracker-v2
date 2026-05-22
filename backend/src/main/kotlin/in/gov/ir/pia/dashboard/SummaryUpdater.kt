package `in`.gov.ir.pia.dashboard

import `in`.gov.ir.pia.repository.ActivityRecordRepository
import `in`.gov.ir.pia.repository.ProjectActivityRepository
import `in`.gov.ir.pia.workflow.WorkflowStateChangedEvent
import org.slf4j.LoggerFactory
import org.springframework.context.ApplicationEventPublisher
import org.springframework.context.event.EventListener
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component
import java.util.UUID

/**
 * Maintains [project_activity_summary] counts in response to workflow transitions,
 * then cascades those changes into [project_summary] and [zone_summary].
 *
 * Runs inside the same DB transaction as the originating write — rolls back
 * atomically if the transition fails.
 *
 * State → column mapping:
 *   DRAFT                      → draft_count
 *   SUBMITTED                  → submitted_count
 *   VERIFIED                   → verified_count
 *   AUTHENTICATED              → authenticated_count
 *   SENT_BACK / SENT_BACK_*    → sent_back_count
 *
 * Any fromState decrements its column; toState increments its column.
 * total_records is recomputed as the sum of all state counts.
 *
 * Cascade chain (all in one transaction):
 *   WorkflowStateChangedEvent
 *     → update project_activity_summary
 *     → publish ProjectSummaryChangedEvent
 *       → update project_summary
 *       → publish ZoneSummaryChangedEvent
 *         → update zone_summary
 */
@Component
class SummaryUpdater(
    private val activityRecordRepo: ActivityRecordRepository,
    private val projectActivityRepo: ProjectActivityRepository,
    private val jdbc: JdbcTemplate,
    private val eventPublisher: ApplicationEventPublisher,
) {
    private val log = LoggerFactory.getLogger(SummaryUpdater::class.java)

    @EventListener
    fun onWorkflowStateChanged(event: WorkflowStateChangedEvent) {
        if (event.entityType != "ACTIVITY_RECORD") return

        val record =
            activityRecordRepo.findById(event.entityId).orElse(null) ?: run {
                log.warn("SummaryUpdater: record {} not found", event.entityId)
                return
            }
        val activity =
            projectActivityRepo.findById(record.projectActivityId).orElse(null) ?: run {
                log.warn("SummaryUpdater: activity {} not found", record.projectActivityId)
                return
            }

        val projectId = activity.projectId
        val typeCode = activity.activityTypeCode

        val fromCol = stateToColumn(event.fromStateCode)
        val toCol = stateToColumn(event.toStateCode)

        // Ensure the summary row exists (upsert with zero counts)
        jdbc.update(
            """
            INSERT INTO project_activity_summary
                (project_id, activity_type_code)
            VALUES (?, ?)
            ON CONFLICT (project_id, activity_type_code) DO NOTHING
            """.trimIndent(),
            projectId,
            typeCode,
        )

        // Decrement fromState column (guard against null — e.g. first transition from DRAFT
        // which was set at record creation, not via a workflow event)
        if (fromCol != null) {
            jdbc.update(
                """
                UPDATE project_activity_summary
                SET $fromCol = GREATEST(0, $fromCol - 1)
                WHERE project_id = ? AND activity_type_code = ?
                """.trimIndent(),
                projectId,
                typeCode,
            )
        }

        // Increment toState column
        if (toCol != null) {
            jdbc.update(
                """
                UPDATE project_activity_summary
                SET $toCol = $toCol + 1
                WHERE project_id = ? AND activity_type_code = ?
                """.trimIndent(),
                projectId,
                typeCode,
            )
        }

        // Recompute total
        jdbc.update(
            """
            UPDATE project_activity_summary
            SET total_records = draft_count + submitted_count + verified_count
                              + authenticated_count + sent_back_count
            WHERE project_id = ? AND activity_type_code = ?
            """.trimIndent(),
            projectId,
            typeCode,
        )

        // Cascade to project summary and then zone summary
        eventPublisher.publishEvent(ProjectSummaryChangedEvent(projectId))

        // ── Per-stage summary (Forest Clearance) ─────────────────────────────
        // Maintain project_forest_stage_summary when the activity is Forest
        // Clearance and the event carries a section code (stage_i / stage_ii /
        // post_approval).  One row per (project_id, stage_code).
        if (activity.activityTypeCode == "FOREST_CLEARANCE" && event.sectionCode != null) {
            val stageCode = event.sectionCode!!

            jdbc.update(
                """
                INSERT INTO project_forest_stage_summary
                    (project_id, stage_code)
                VALUES (?, ?)
                ON CONFLICT (project_id, stage_code) DO NOTHING
                """.trimIndent(),
                projectId,
                stageCode,
            )

            if (fromCol != null) {
                jdbc.update(
                    """
                    UPDATE project_forest_stage_summary
                    SET $fromCol = GREATEST(0, $fromCol - 1)
                    WHERE project_id = ? AND stage_code = ?
                    """.trimIndent(),
                    projectId,
                    stageCode,
                )
            }

            if (toCol != null) {
                jdbc.update(
                    """
                    UPDATE project_forest_stage_summary
                    SET $toCol = $toCol + 1
                    WHERE project_id = ? AND stage_code = ?
                    """.trimIndent(),
                    projectId,
                    stageCode,
                )
            }

            jdbc.update(
                """
                UPDATE project_forest_stage_summary
                SET total_records = draft_count + submitted_count + verified_count
                                  + authenticated_count + sent_back_count
                WHERE project_id = ? AND stage_code = ?
                """.trimIndent(),
                projectId,
                stageCode,
            )
        }

        // ── Per-subtype summary (Utility Shifting) ────────────────────────────
        // Maintain project_utility_subtype_summary when the record has a subtype.
        val subtype = record.recordSubtype ?: return

        jdbc.update(
            """
            INSERT INTO project_utility_subtype_summary
                (project_id, record_subtype)
            VALUES (?, ?)
            ON CONFLICT (project_id, record_subtype) DO NOTHING
            """.trimIndent(),
            projectId,
            subtype,
        )

        if (fromCol != null) {
            jdbc.update(
                """
                UPDATE project_utility_subtype_summary
                SET $fromCol = GREATEST(0, $fromCol - 1)
                WHERE project_id = ? AND record_subtype = ?
                """.trimIndent(),
                projectId,
                subtype,
            )
        }

        if (toCol != null) {
            jdbc.update(
                """
                UPDATE project_utility_subtype_summary
                SET $toCol = $toCol + 1
                WHERE project_id = ? AND record_subtype = ?
                """.trimIndent(),
                projectId,
                subtype,
            )
        }

        jdbc.update(
            """
            UPDATE project_utility_subtype_summary
            SET total_records = draft_count + submitted_count + verified_count
                              + authenticated_count + sent_back_count
            WHERE project_id = ? AND record_subtype = ?
            """.trimIndent(),
            projectId,
            subtype,
        )
    }

    /**
     * Refreshes [project_summary] for [event.projectId] by re-aggregating its
     * activity-level summaries and current drawing counts.
     *
     * Published synchronously within the originating transaction.
     */
    @EventListener
    fun onProjectSummaryChanged(event: ProjectSummaryChangedEvent) {
        val projectId = event.projectId

        // Upsert project_summary — aggregate from project_activity_summary +
        // live drawing count from activity_records.
        jdbc.update(
            """
            INSERT INTO project_summary
                (project_id, total_records, authenticated_count, drawings_in_approval, sla_breach_count)
            SELECT
                ?                                                          AS project_id,
                COALESCE(SUM(pas.total_records), 0)                       AS total_records,
                COALESCE(SUM(pas.authenticated_count), 0)                 AS authenticated_count,
                (SELECT COUNT(*)
                 FROM activity_records ar
                 JOIN project_activities pa ON ar.project_activity_id = pa.id
                 WHERE pa.project_id = ?
                   AND pa.activity_type_code = 'DRAWING_APPROVAL'
                   AND ar.record_state = 'IN_APPROVAL'
                   AND NOT ar.is_deleted)                                  AS drawings_in_approval,
                0                                                          AS sla_breach_count
            FROM project_activity_summary pas
            WHERE pas.project_id = ?
            ON CONFLICT (project_id) DO UPDATE
                SET total_records        = EXCLUDED.total_records,
                    authenticated_count  = EXCLUDED.authenticated_count,
                    drawings_in_approval = EXCLUDED.drawings_in_approval,
                    sla_breach_count     = EXCLUDED.sla_breach_count
            """.trimIndent(),
            projectId, projectId, projectId,
        )

        // Cascade to zone summary
        val zoneId = jdbc.queryForObject(
            "SELECT zone_id FROM projects WHERE id = ?",
            UUID::class.java, projectId,
        ) ?: run {
            log.warn("SummaryUpdater: zone_id not found for project {}", projectId)
            return
        }

        eventPublisher.publishEvent(ZoneSummaryChangedEvent(zoneId))
    }

    /**
     * Refreshes [zone_summary] for [event.zoneId] by re-counting projects
     * and summing their KPIs from [project_summary].
     *
     * Published synchronously within the originating transaction.
     */
    @EventListener
    fun onZoneSummaryChanged(event: ZoneSummaryChangedEvent) {
        val zoneId = event.zoneId

        jdbc.update(
            """
            INSERT INTO zone_summary
                (zone_id, projects_active, projects_with_sla_breaches, total_drawings_in_approval)
            VALUES (
                ?,
                (SELECT COUNT(*)
                 FROM projects
                 WHERE zone_id = ?
                   AND NOT is_deleted
                   AND lifecycle_state NOT IN ('COMPLETED', 'DROPPED')),
                (SELECT COUNT(*)
                 FROM project_summary ps
                 JOIN projects p ON ps.project_id = p.id
                 WHERE p.zone_id = ?
                   AND ps.sla_breach_count > 0),
                (SELECT COALESCE(SUM(ps.drawings_in_approval), 0)
                 FROM project_summary ps
                 JOIN projects p ON ps.project_id = p.id
                 WHERE p.zone_id = ?)
            )
            ON CONFLICT (zone_id) DO UPDATE
                SET projects_active            = EXCLUDED.projects_active,
                    projects_with_sla_breaches = EXCLUDED.projects_with_sla_breaches,
                    total_drawings_in_approval = EXCLUDED.total_drawings_in_approval
            """.trimIndent(),
            zoneId, zoneId, zoneId, zoneId,
        )
    }

    /** Maps a workflow state code to its summary column name, or null if unmapped. */
    private fun stateToColumn(stateCode: String?): String? =
        when (stateCode) {
            null -> null
            "DRAFT" -> "draft_count"
            "SUBMITTED_FOR_VERIFICATION" -> "submitted_count"
            "VERIFIED" -> "verified_count"
            "AUTHENTICATED" -> "authenticated_count"
            "SENT_BACK_TO_DYCE", "SENT_BACK_TO_NODAL" -> "sent_back_count"
            else -> null
        }
}
