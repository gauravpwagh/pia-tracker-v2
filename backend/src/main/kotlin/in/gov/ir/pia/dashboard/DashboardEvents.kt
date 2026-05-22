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
