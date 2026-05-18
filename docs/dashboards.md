# PIA Tracker — Dashboards

**Status:** Draft v1.
**See also:** `architecture.md` § 4.3 (write-time aggregation); `database.md` § 10 (summary tables); `permissions.md` § 2 (DASHBOARD permissions).

This document specifies the summary table model, per-activity dashboards, the cross-activity project dashboard, zone and PAN India dashboards, the alert/SLA-breach surfacing, and Excel export.

---

## 1. Write-time aggregation summary tables

Every dashboard reads from a summary table. The full schema for the land summary table is in `database.md` § 10; here's the catalog of summary tables in v1:

| Summary table | Granularity | Updated by domain events |
|---|---|---|
| `project_land_summary` | one row per `project_activities` of type LAND_ACQUISITION | `LandRecordSaved`, `SectionStateChanged` (LA) |
| `project_utility_summary` | one row per `project_activities` of type UTILITY_SHIFTING | `UtilityRecordSaved`, `RecordStateChanged` (US) |
| `project_forest_summary` | one row per `project_activities` of type FOREST_CLEARANCE | `ForestRecordSaved`, `SectionStateChanged` (FC) |
| `project_drawing_summary` | one row per `project_activities` of type DRAWING_APPROVAL | `DrawingSubmitted`, `DrawingApproverActed` |
| `project_tender_summary` | one row per `project_activities` of type TENDER_PACKAGING | `TenderRecordSaved` |
| `project_office_summary` | one row per `project_activities` of type TEMPORARY_OFFICE_SPACE | `OfficeRecordSaved` |
| `project_summary` | one row per project (cross-activity roll-up) | any of the above + `ProjectLifecycleChanged` |
| `zone_summary` | one row per zone | any project change in the zone |
| `pan_india_summary` | one row, total system | any zone change |

All updates happen in the same transaction as the originating write, via the `SummaryUpdater` service.

---

## 2. The `SummaryUpdater` pattern

```kotlin
@Component
class SummaryUpdater(
    private val landRepo: ProjectLandSummaryRepository,
    private val utilityRepo: ProjectUtilitySummaryRepository,
    // ... etc
) {
    @EventListener
    fun onLandRecordSaved(event: LandRecordSaved) {
        val activity = event.activity
        val summary = landRepo.findByActivityIdOrCreate(activity.id)
        summary.totalHectares = computeTotalHectaresFor(activity)
        summary.acquiredHectares = computeAcquiredHectaresFor(activity)
        summary.villageCount = countVillagesFor(activity)
        summary.villageCountCleared = countClearedVillagesFor(activity)
        summary.slaBreachCount = countSlaBreachesFor(activity)
        summary.lastUpdatedAt = Instant.now()
        landRepo.save(summary)

        // Cascade to project summary
        eventPublisher.publishEvent(ProjectSummaryChanged(activity.projectId))
    }

    @EventListener
    fun onProjectSummaryChanged(event: ProjectSummaryChanged) {
        val project = projectRepo.findById(event.projectId).orElseThrow()
        val projectSummary = projectSummaryRepo.findByProjectIdOrCreate(project.id)
        projectSummary.recomputeFrom(project, /* all activity summaries */)
        projectSummaryRepo.save(projectSummary)
        eventPublisher.publishEvent(ZoneSummaryChanged(project.zoneId))
    }

    // similar cascades for zone and pan_india
}
```

Domain events are published by services after a transactional write; `@EventListener` runs in the same transaction (Spring's default for non-`@Async` listeners). If anything fails, the whole write rolls back. No stale dashboards.

A scheduled job (`SummaryReconciliationJob`) runs every 15 minutes and recomputes any summary whose `last_updated_at` is older than 1 hour or whose underlying record count differs from the cache. Catches drift from missed events or manual data fixes.

---

## 3. Dashboard scopes

Every dashboard is one of three scopes, each surfaced by a different permission:

- **Project scope** (`DASHBOARD.VIEW.PROJECT`): one project's activities. The detail pane on the Tree view (architecture § 6 archetype 2) is effectively a project-scope dashboard.
- **Zone scope** (`DASHBOARD.VIEW.ZONE`): all projects in a zone.
- **PAN India scope** (`DASHBOARD.VIEW.PAN_INDIA`): system-wide totals, drill-downs to zone then project.

Standalone dashboard pages (left-sidebar entry "Dashboard") show whichever the user's permissions admit; if a user has multiple, a scope selector appears at the top.

---

## 4. Land Acquisition dashboard

Activity-scope and project-scope variants. Activity-scope appears in the tree-view detail pane when a Land Acquisition activity is selected.

**Top KPI strip (cards):**

- Total area to be acquired (hectares)
- Acquired to date (hectares + percentage)
- Balance pending (hectares)
- Days since RB recommendation (large number, red if > 365)
- SLA breaches (count)

**Split-by-ownership chart:**

Horizontal stacked bar showing private / govt / forest hectares, with acquired vs balance broken out.

**Pending split:**

Two doughnuts: "Pending with Railway" (sections under Dy CE/C / Nodal / CE/C) vs "Pending with State Govt" (sections waiting on external action like CALA nomination, 20D objections).

**Villages table:**

Sortable, filterable. Columns: village name, district, chainage from-to, area (ha), section-status icons (9 icons one per section), workflow state, pending-with, pending-since (days). The same table appears in the Tree-view's detail pane when an activity is selected.

**Balance length affected:**

Single number — kilometres of track length blocked by un-acquired land.

**Excel export:** all of the above as a multi-sheet workbook: Summary, Villages (full data), Pending Items, SLA Breaches.

---

## 5. Utility Shifting dashboard

**Top KPI strip:**

- Total utility items identified (count)
- Shifted to date (count + percentage)
- Pending (count)
- SLA breaches (count)

**By utility type chart:**

Horizontal bar showing total, shifted, pending per utility type (LT/HT/EHV, Pipeline, S&T, Quarter/Station, TSS/SS/OHE, Other).

**By executing agency:**

Doughnut: items being executed by Railway vs User vs Open Line vs Construction.

**Records table:**

Columns: utility type, owner agency, chainage, length affected, relocation required, executing agency, target date, current state, days remaining/overdue.

---

## 6. Forest Clearance dashboard

**Three-stage progress strip:**

A horizontal stepper showing each forest clearance record's progress through Stage I, Stage II, Post-Approval. Each step colored by state.

**Records table:**

Columns: forest division, area (ha), Stage I status + date, Stage II status + date, Post-Approval status + date, queries open, total elapsed days, pending-with.

**Time-in-each-stage:**

Box plot or bar chart — average days spent in each stage across all records. Useful for spotting bottlenecks at the Stage II compliance stage.

---

## 7. Drawing Approval dashboard

**Top KPI strip:**

- Total drawings (count)
- Approved (count + percentage)
- In approval (count)
- Sent back (count)
- Approvers with pending > 30 days (count) — the "stuck approvers" view

**By drawing type table:**

Rows: drawing type. Columns: total, draft, in approval, approved, average days in approval. Click → opens filtered records list.

**Approver heatmap:**

Grid: rows = approval designations, columns = drawing types. Each cell colored by how many drawings are pending with that designation/type combo. Click a cell → opens the filtered records list. Surfaces "Sr DEN has 23 ESP drawings pending" type insights.

**Records table:**

Columns: drawing type, drawing number, name of section, current state, count of pending approvers, oldest pending days, total approvers, approvers approved.

---

## 8. Tender Packaging and Temporary Office Space dashboards

Smaller. Records table with state and pending-with columns. KPI strip with total / completed / pending counts.

---

## 9. Project overview dashboard

Shown in the tree-view detail pane when a project node is selected. Composes the activity-level dashboards into a roll-up:

**Header card:** project code, name, zone/division, lifecycle state, days since RB recommendation (large), target completion year, overall progress percentage.

**Activity grid:** 7 cards (or fewer, depending on how many activities the project has), one per activity. Each card shows:

- Activity type icon + name (e.g., "Phase 1 Land Acquisition")
- Primary KPI (e.g., "12 of 18 villages cleared")
- Secondary KPI (e.g., "47 ha balance")
- RAG indicator (green / amber / red)
- Click → tree node opens, activity detail loads

**Cross-activity health indicators:** SLA breaches total, pending items total, recently-active items count.

**Tabs:** Summary (the above), Comments (project-level), Team (the project_assignments rows), History (project-level audit log), Documents (attachments at project level).

---

## 10. Zone dashboard

Permission: `DASHBOARD.VIEW.ZONE`. Reads from `zone_summary` and aggregates the per-project summaries within the zone.

**Top KPI strip:** projects active, projects with SLA breaches, total land balance (ha), total drawings in approval.

**Projects table:** sortable. Columns: project code, name, division, lifecycle state, days since RB, overall progress, SLA breaches, primary issues (textual hint computed from worst-pending item).

**Charts:** projects-by-state doughnut, average days-in-approval by drawing type, top 10 most-delayed projects.

**Drill-down:** click a project row → opens the Tree view scoped to that project.

---

## 11. PAN India dashboard

Permission: `DASHBOARD.VIEW.PAN_INDIA` (a system grant; not designation-derived).

Identical to zone dashboard but one level up. Top KPIs are total-system. Projects table is sortable by zone. Same drill-down pattern: click a zone row → zone dashboard scoped to that zone.

---

## 12. SLA breach surfacing

SLA breaches show up in four places:

1. **Dashboard counters.** Every summary table has an `sla_breach_count` column. Updated by `SummaryUpdater` whenever a workflow transition or scheduled SLA-check job runs.
2. **Tree node visual indicators.** Architecture § 6 archetype 2: warning icon on the relevant tree node; bubbles up to parent activity and parent project nodes.
3. **Records table coloring.** Rows in pending-since column show amber after `sla_warning_days`, red after `sla_days`.
4. **Inbox tab.** "SLA Breached" tab on every user's inbox shows their pending items past SLA.

In-app notifications fire once per instance when it first crosses the threshold — the `SlaBreachDetectionJob` runs every 15 minutes and emits `NotificationType.SLA_BREACH` for newly-breached instances (recipient = role-required user + project's CE/C).

---

## 13. Excel export

Every dashboard has an "Export" button in its top-right. Server-side generation via Apache POI.

**Format:**

- One Excel workbook per export.
- First sheet: "Summary" — KPI values, generation timestamp, filter context.
- Subsequent sheets: one per major data section (e.g., for Land Acquisition: Villages, Pending Items, SLA Breaches, Audit Notes).
- Columns mirror the on-screen tables. Frozen header row, auto-sized columns.
- Cell formatting: dates as `YYYY-MM-DD`, decimals with appropriate precision, status as text (no color coding in cells — the data should be readable in any tool).

**Synchronous vs asynchronous:**

- Synchronous (download starts immediately): project scope, activity scope, expected row count < 10,000.
- Asynchronous (job queued, link to download appears in a notification): zone scope and PAN India scope, or any export expected to produce > 10,000 rows. Job state in a `export_jobs` table. The export is generated in the background; user gets an in-app notification with a one-time download link when ready.

**Permissions:** `EXPORT.PROJECT`, `EXPORT.ZONE`, `EXPORT.PAN_INDIA` gate the scopes. Every export is logged as a SECURITY_EVENT in audit_log (who, what scope, what filters, when).

**Templates** (Phase 2 enhancement): a `report_templates` table holds Excel template files uploaded by Admin. POI fills in named ranges. Lets the format be tweaked without code change.

---

## 14. Dashboard configuration

Dashboard definitions live in `dashboard_definitions` (database.md § 6). Each row has a `layout_json` shaped roughly like:

```json
{
  "scope": "PROJECT",
  "activity_type": "LAND_ACQUISITION",
  "widgets": [
    {
      "id": "kpi_total",
      "type": "kpi_card",
      "position": { "row": 0, "col": 0, "w": 3, "h": 1 },
      "title": "Total area to be acquired",
      "metric": "total_hectares",
      "unit": "ha"
    },
    {
      "id": "ownership_chart",
      "type": "stacked_horizontal_bar",
      "position": { "row": 1, "col": 0, "w": 12, "h": 3 },
      "title": "Acquired vs balance by ownership",
      "series": ["private", "govt", "forest"],
      "data_query": "land_acquired_vs_balance_by_ownership"
    },
    {
      "id": "villages_table",
      "type": "records_table",
      "position": { "row": 4, "col": 0, "w": 12, "h": 8 },
      "columns": ["village_name", "district", "chainage", "area_ha",
                  "section_status_icons", "workflow_state", "pending_with", "pending_since"]
    }
  ]
}
```

The frontend has a dashboard renderer that dispatches on `widget.type`. The backend has a query registry — each `data_query` string maps to a SQL/jOOQ function returning typed data. Adding a widget type means adding a renderer plus (if needed) a query.

Editing a dashboard layout is done through the admin dashboard editor (UI archetype 6, Phase 2 feature). For v1, dashboards are seeded by Flyway and edits go through migrations.

---

## 15. Performance budgets

Per `architecture.md` § 14:

- Dashboard query response: < 300 ms
- Excel export start (sync): < 5 seconds for project-scope; async for zone+
- Tree expand and detail-pane load: < 200 ms

All summary table reads are O(1) on indexed FK columns. The expensive queries are the underlying detail tables when drilling down — these are scoped (project_id or zone_id) so the indexes do their job.

For Phase 2 performance work: expression indexes on JSONB paths used in detail-table filters, materialization of expensive cross-activity computations as additional summary columns, partial indexes on `record_state` for the most common state filters.
