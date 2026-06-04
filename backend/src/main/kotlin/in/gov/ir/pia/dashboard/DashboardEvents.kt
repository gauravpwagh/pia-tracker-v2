package `in`.gov.ir.pia.dashboard

import java.util.UUID

/**
 * Published by [SummaryUpdater] after a project's activity-level summary row
 * ([project_activity_summary]) is updated.  Triggers the cascade that refreshes
 * [project_summary] for the project and then [zone_summary] for its zone.
 */
data class ProjectSummaryChangedEvent(val projectId: UUID)

/**
 * Published by [SummaryUpdater] after [project_summary] is refreshed for a
 * project.  Triggers the cascade that refreshes [zone_summary] for the zone.
 */
data class ZoneSummaryChangedEvent(val zoneId: UUID)

/**
 * Published by [ActivityService] immediately after an [ActivityRecord] row is
 * persisted for the first time (record_state = DRAFT, no workflow action yet).
 *
 * [SummaryUpdater] handles this to seed / increment the [project_activity_summary]
 * draft_count, making newly created records visible on the dashboard before any
 * workflow action is taken.
 *
 * For Utility Shifting records [recordSubtype] is the utility type code; for all
 * other activity types it is null.
 */
data class ActivityRecordCreatedEvent(
    val projectId: UUID,
    val activityTypeCode: String,
    val recordSubtype: String?,
)
