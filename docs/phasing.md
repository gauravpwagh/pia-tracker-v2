# PIA Tracker — Phasing

**Status:** Draft v1.
**See also:** `architecture.md` § 13 (phasing overview).

This document specifies the three release phases as 35 sub-phases. Each sub-phase has an explicit acceptance gate — a test that must pass before the sub-phase is complete. The gates are cumulative: once a sub-phase passes its gate, subsequent sub-phases must keep it passing.

---

## Phase 1 — Foundation + Land Acquisition (~11–12 weeks)

The vertical slice. Everything needed to make a single activity (Land Acquisition) work end-to-end, on the assumption that subsequent activities reuse the foundation.

### 1.1 Project skeleton and Mode 1 setup (1 week)

Build the repository skeleton: backend Gradle project, frontend Vite project, docker-compose, Makefile, lefthook, README. mkcert local CA setup. Hello-world endpoint and React route.

**Gate:** `make setup` on a fresh laptop reaches `https://pia.local/` showing a placeholder home page in under 12 minutes. `make test` passes (one trivial test per side). `make lint` passes.

### 1.2 Database foundation and Flyway (3–4 days)

Postgres container, Flyway running, V001 baseline schema with the structural tables (zones, divisions, designations, users, user_zone_assignments, audit_log partitioning). Reference seed (zones, divisions, designations). The audit log immutability trigger.

**Gate:** Flyway migrates from empty to V001 successfully. `audit_log` rejects UPDATE and DELETE. Reference seed populates all zones and designations. Repository tests pass for zone and designation read.

### 1.3 Dummy auth and Principal (3 days)

Spring Security's `AuthenticationProvider` returning a hardcoded `Principal` built from a user row. Role-picker UI on the frontend; session cookie carries the chosen user ID.

**Gate:** Logging in as different seeded users yields different `Principal`s server-side. `/api/v1/auth/me` returns the right user. Logout clears the session. CI confirms dummy-auth code paths are gated by the `dev` and `beta` Spring profiles and not present in `prod`.

### 1.4 Permission framework (4 days)

Permission registry seeded. `PermissionEvaluator` bean. `@PreAuthorize` annotations and SpEL bindings. Query-level filter pattern in repositories. Scope-implication rules.

**Gate:** Unit test matrix: every permission code is gated on a dummy endpoint; every principal type either passes or fails the right combinations. Query-level filter test: a project in a non-accessible zone is invisible to a user list query but reachable from a direct ID load (and that load returns 404).

### 1.5 Form definitions and JSON Schema validation (4 days)

`form_definitions` table. networknt validator wired in. The schema-diff classifier. Form-definitions read/list endpoint.

**Gate:** A seeded `form_definitions` row roundtrips through GET. Invalid form data is rejected with a 422 + structured error. The diff classifier correctly labels at least 10 hand-crafted pairs (5 backwards-compatible, 5 breaking).

### 1.6 Workflow engine (5 days)

`workflow_definitions`, `workflow_states`, `workflow_transitions`, `workflow_instances`, `workflow_history`. `WorkflowService.start()` and `WorkflowService.transition()`. The `RECORD_STANDARD_V1` and `SECTION_STANDARD_V1` and `PROJECT_LIFECYCLE_V1` definitions seeded.

**Gate:** Property test: from every state in `RECORD_STANDARD_V1`, only configured transitions are reachable. Integration test: starting a record workflow + walking it through the full submit → verify → authenticate path writes the right history rows and updates the cached `record_state`. Sent-back path tested.

### 1.7 Project entity and lifecycle (4 days)

`projects` table. CRUD endpoints. Project creation wizard. The `PROJECT_LIFECYCLE_V1` workflow wired up. `project_assignments` table. CAO/C allocate and CE/C assign-Dy-CE flow.

**Gate:** E2E playwright test: EDGS/C-I creates a project → CAO/C of the zone allocates to a CE/C → CE/C assigns two Dy CE/Cs and designates one as Nodal. All assignments visible in `project_assignments`. Audit log has the right rows.

### 1.8 Activity and record entities (3 days)

`project_activities`, `activity_records` tables. Endpoints. The Add Activity modal in the project tree. Activity creation gates on `ACTIVITY.CREATE.ASSIGNED`. Records are addressable but empty.

**Gate:** A Dy CE/C creates a Land Acquisition activity on their project. An activity-of-the-same-type can be added a second time (decision YYY). A non-assigned Dy CE/C gets 403.

### 1.9 RJSF integration and form rendering (4 days)

RJSF wired up. The custom widgets (chainage, gazette_reference, attachment placeholder). The Record Edit Page archetype skeleton. Section-tabs nav. Autosave every 30s.

**Gate:** A Dy CE/C opens an empty Land Acquisition record. Fills the village name + chainage. Switches sections. Returns. Data persists. Network tab shows debounced PATCH calls.

### 1.10 Land Acquisition form definition (3 days)

`LAND_ACQUISITION_V1` seeded with all 9 sections and all fields per `forms.md` § 5. Cross-field validator class. Per-section `section_codes` and corresponding workflow_instances created at record save.

**Gate:** Saving a Land Acquisition record creates 9 workflow_instances. JSON Schema validation catches a missing required field. Cross-field validator catches the 20A-before-20E case. All 9 sections render their fields correctly.

### 1.11 Workflow actions in UI (3 days)

Submit / Verify / Authenticate / Send Back buttons on the Record Edit page. Workflow right-panel tab. Section-aware action wiring (each section transitions independently). Comments on transitions where required.

**Gate:** E2E: Dy CE/C submits SRP section. Nodal verifies it. CE/C authenticates it. Section icon updates in the left nav. Workflow history reflects the chain.

### 1.12 Permission-gated UI and inbox (3 days)

The role-aware sidebar. Permission gates on action buttons (decision OOO — visible-but-disabled with tooltip). The Inbox archetype querying for items pending the current user.

**Gate:** Switching users in the role picker changes the inbox count and contents. A Dy CE/C sees their pending drafts; a Nodal sees items awaiting verification; a CE/C sees items awaiting authentication. Action buttons appear/disappear by permission.

### 1.13 Comments and history right-panel (3 days)

`comments` table. Right-panel Comments tab with markdown + @mention typeahead. History tab pulling from `audit_log`. Workflow tab.

**Gate:** A Nodal sends back with comment. Comment appears in the panel. History shows the transition. The send-back recipient gets a notification (next sub-phase).

### 1.14 Notifications, attachments, audit, dashboard MVP (5 days)

`notifications` table with bell badge polling. `attachments` upload through MinIO with ClamAV scan. Audit log integration: every workflow transition writes a row. `project_land_summary` and basic Land Acquisition dashboard widgets (KPI strip + villages table) on the tree-view detail pane.

**Gate (Phase 1 final):** The full Land Acquisition golden path E2E: project creation → activity creation → record creation → fill SRP → upload gazette PDF (scanned by ClamAV) → submit → verify → authenticate. After completion: notification fired to the originator at each handoff, attachment downloadable, dashboard shows updated village-cleared count, audit log shows the chain, send-back scenario tested as a separate path. Full Lighthouse pass on the record-edit page (perf > 80, a11y > 95).

---

## Phase 2 — Remaining activities + dashboards + drawings (~10 weeks)

The horizontal expansion. Reuse Phase 1's foundation for the other six activities. Build the cross-activity dashboards and drawings.

### 2.1 Tender Packaging (3 days)

Form definition seeded. Activity-creation flow extended. Dashboard widget (table-style; very simple).

**Gate:** Dy CE/C creates a Tender Packaging activity and a record. Submit → verify → authenticate works. Dashboard widget shows count.

### 2.2 Temporary Office Space (3 days)

Same as 2.1, with conditional fields based on structure type.

**Gate:** All three structure types (NEW_REQUIRED, OLD_AVAILABLE, HIRING) render their conditional fields. Records flow through workflow.

### 2.3 Utility Shifting master form (5 days)

`UTILITY_SHIFTING_V1` with utility-type discriminator. Records list filtered by `record_subtype`. Activity-level dashboard with utility-type breakdown.

**Gate:** Creating records of each utility type works. Filter on the list works. Dashboard shows counts by type.

### 2.4 Forest Clearance with stage-level workflow (5 days)

`FOREST_CLEARANCE_V1` with three stages. Stage-level workflow instances. Queries array (date submitted / date returned) per stage. Dashboard with stage-progression display.

**Gate:** Each stage transitions independently. The "stage I authenticated but II in draft" state is valid. Dashboard correctly shows in-stage counts.

### 2.5 Drawings checklist model (1 week)

`drawing_approvers` table. `DrawingService` with state derivation. Drawing-specific endpoints (approve, send-back, edit approvers). The drawing-record edit page with approver list as the central UI element.

**Gate:** A drawing is created with default approvers (computed from the form definition). Each approver can approve independently. A send-back from one approver flips only that row to SENT_BACK; others unchanged (decision CCCC). Re-submit after addressing the issue sends back to PENDING.

### 2.6 Drawing form definitions (1 week)

All ~22 drawing form definitions (ESP, SIP, ST/LT, SWR, SWRD, FAT, SAT, RSP, cable route plan, LOP, project sheet, GAD mega/major/minor, LWR plan, curve details, grade condonation, bridge minor, yard dispensation, yard minor, station building GAD, FOB GAD/TAD, tunnel design). `default_approver_designations` seeded per type.

**Gate:** Each drawing type can be created, fills its specific fields, gets the right default approver list. The picker for "add approver" filters to approval-role designations.

### 2.7 Drawing approver edit flow (3 days)

Add / remove / reassign approvers. Permission gated to Admin / CE/C / Nodal Dy CE/C (decision AAAA). Removal soft-deletes; addition inserts.

**Gate:** A CE/C adds an unlisted Sr DEN to a drawing. The Sr DEN sees it in their inbox. A Nodal removes an approver who hasn't acted yet; the row goes to is_deleted=true. APPROVED rows preserved on approver-list edits (decision BBBB).

### 2.8 Dashboard expansion: zone scope (1 week)

Zone summary table with `SummaryUpdater` cascades. Zone dashboard page. Drill-down to project. `DASHBOARD.VIEW.ZONE` gating.

**Gate:** A CAO/C of NR sees an NR-scope dashboard with all NR projects rolled up. Clicking a project drills into its tree. Cross-zone users (with zone grants) see their accessible zones.

### 2.9 PAN India dashboard (3 days)

`pan_india_summary` table. PAN India dashboard page. `DASHBOARD.VIEW.PAN_INDIA` system grant.

**Gate:** An EDGS/C-I (with the system grant) sees PAN India totals. Drill-down by zone, then by project. Numbers reconcile (sum of zones = PAN India).

### 2.10 Excel export (5 days)

Apache POI integration. Sync export for project-scope; async for zone+. `export_jobs` table for async. Templates as code (no template file uploads at v1).

**Gate:** Project-scope export downloads .xlsx with the expected sheets and row counts. Zone-scope export queues, completes, notification fires, download link works once and expires. Excel files open in real Excel without warnings.

### 2.11 Cross-activity refinements (1 week)

The cross-activity dashboard on the project tree-view detail pane. SLA breach surfacing across all four spots (dashboard counters, tree node visuals, list table coloring, inbox tab). Bulk transition implementation on lists.

**Gate:** SLA breaches appear on tree nodes (with bubble-up to parent activity and project). Inbox "SLA Breached" tab has the right items. A CE/C bulk-authenticates 5 records in one action; the audit log has 5 entries.

### 2.12 Phase 2 hardening (1 week)

Performance work: GIN index review, slow-query log analysis, expression indexes on hot JSONB paths. CI promotion to Gitea Actions. Visual-regression baselines committed. Backup drill (the first one in the project).

**Gate:** All dashboard queries < 300ms p95 on a realistic dataset (3 zones, 20 projects, 500 records, 200 drawings). CI runs full Phase 2 test suite in < 25 min. Backup drill: restore on a clean VM succeeds; all expected data present.

---

## Phase 3 — Production hardening (~8 weeks)

Real auth, email, chunked uploads, search, production deployment. Bridges the gap from beta to production.

### 3.1 Keycloak integration (1 week)

Real authentication. JWT bearer flow. Refresh tokens. Session blocklist for logout.

**Gate:** Dummy auth code path returns 401 in `prod` profile. A user logs in via Keycloak, lands in PIA Tracker with the right Principal built from claims. Logout invalidates the JWT (subsequent requests with the token get 401).

### 3.2 User provisioning (4 days)

Sync users from Keycloak to the `users` table on first login. Designation, zone, division from Keycloak attributes. Manual override by Admin for adjustments.

**Gate:** A new user, after Keycloak login, gets a `users` row with the right designation. Admin can override their zone. Audit log captures the override.

### 3.3 Email notifications (5 days)

SMTP integration. Email template engine (Thymeleaf). Per-notification-type template files. User preferences (in-app only vs email + in-app).

**Gate:** A send-back notification triggers an email to the recipient with a deep link. Notification preferences page lets a user disable email per type while keeping in-app.

### 3.4 Chunked uploads for large attachments (4 days)

tus.io protocol or multipart upload via MinIO direct-put. ~500 MB cap (vs 48 MB at v1).

**Gate:** A 200 MB PDF uploads with progress reporting. Network interruption resumes. ClamAV scan runs on assembled file.

### 3.5 Full-text search (1 week)

Postgres full-text search (`tsvector` columns) on projects, activities, records, comments. Search page. Search box in the top bar.

**Gate:** Searching for "Nimach" returns the Nimach-Ratlam project, its activities, its records, and comments mentioning the village. Permission filter applies — users only see things they could otherwise see.

### 3.6 Visual regression and accessibility production-grade (4 days)

Visual regression baselines locked for all archetypes in both themes. Accessibility audit by external reviewer; remediation of all findings to AA level.

**Gate:** Independent a11y audit passes. Visual-regression suite stable for two weeks of CI runs.

### 3.7 Production deployment automation (1 week)

Ansible playbook for fresh-VM provisioning. Production docker-compose overlay. Production Prometheus + Grafana provisioning. Production alerting wired to Railway IT.

**Gate:** A new VM goes from bare OS to running PIA Tracker via one Ansible run. Grafana dashboards live. Alerts fire on test failures.

### 3.8 Pentest and remediation (2 weeks)

External pentest. Remediation of all critical and high findings.

**Gate:** Pentest report with no unaddressed criticals or highs. SUPER_ADMIN runbook reviewed and approved.

### 3.9 Production cutover (3 days)

Soft launch with one zone. Two-week observation period. Gradual expansion to all zones.

**Gate:** Cutover day: first real project authenticated end-to-end in production. Audit log integrity check passes for the first week. Backup drill succeeds at the one-month mark.

---

## Cross-phase obligations

Throughout all phases:

- Every PR must reference a documentation update if it crosses an architectural boundary.
- Every new state transition, permission, form field, or workflow action must have a test.
- Every breaking schema change must include the inverse migration plan in the changelog.
- Every sub-phase ends with a documentation review: do the docs still describe reality? If not, the doc PR ships with the code PR.
- Every two sub-phases, a "tech-debt slot" (a half-day in the next sub-phase's plan) for the team to address whatever sharp edge surfaced. The slot is not optional.

The decision log (architecture.md § 16) is appended to with every meaningful architecture decision. New decisions are letter-coded sequentially.
