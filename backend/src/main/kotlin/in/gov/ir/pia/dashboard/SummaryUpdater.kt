package `in`.gov.ir.pia.dashboard

import `in`.gov.ir.pia.repository.ActivityRecordRepository
import `in`.gov.ir.pia.repository.ProjectActivityRepository
import `in`.gov.ir.pia.workflow.WorkflowStateChangedEvent
import org.slf4j.LoggerFactory
import org.springframework.context.event.EventListener
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component

/**
 * Maintains [project_activity_summary] counts in response to workflow transitions.
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
 */
@Component
class SummaryUpdater(
    private val activityRecordRepo: ActivityRecordRepository,
    private val projectActivityRepo: ProjectActivityRepository,
    private val jdbc: JdbcTemplate,
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
