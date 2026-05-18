# PIA Tracker — Architecture

**Status:** Draft v1 — Locked after 13 turns of planning.
**Audience:** Engineers working on the system, including Claude Code.
**Companion documents:** `database.md`, `workflow.md`, `permissions.md`, `forms.md`, `dashboards.md`, `ui.md`, `api.md`, `security.md`, `testing.md`, `deployment.md`, `phasing.md`.

This document is the single anchor for every design choice in PIA Tracker. Every other document references back to here. If a later doc and this one conflict, this one is wrong — update it first, then propagate.

---

## 1. Purpose and Scope

PIA Tracker is an internal web application for Indian Railways that records and tracks **Pre-Investment Activities** for railway construction projects: the work that happens between Railway Board recommending a project and the project becoming executable. It replaces the current practice of email threads, Excel sheets, and ad-hoc status reviews with a structured, audit-ready system of record.

The seven activity categories it covers are land acquisition, forest clearance, utility shifting, drawing preparation and approval, tender packaging, identification of temporary site offices, and (added in spec) project metadata itself. Each activity has its own forms, workflow states, and SLA expectations.

**In scope for v1:**

- Project lifecycle from EDGS/C-I creation through CE/C authentication.
- All seven activities with their data entry forms, section/record workflows, and dashboards.
- Designation-based picker filtering by zone and division.
- Comments with @mentions, audit log with diffs, in-app notifications, soft delete with retention.
- File attachments up to 48 MB (PDFs), scanned by ClamAV.
- Excel export from every dashboard; HTML+CSS print stylesheet for project summaries.
- Dummy authentication via role picker (real SSO deferred to Phase 3).
- Single-machine local beta deployment; production on a single Railway VM later.

**Out of scope for v1:**

- Integration with IRPSM, HRMS, or any other railway system. No external data sources, no outbound feeds.
- Real authentication (Keycloak/OAuth2) — deferred to Phase 3.
- Email or SMS notifications — alerts are dashboard-only until Phase 3.
- Mobile or tablet UI — desktop only at 1366×768 minimum.
- Full-text search — deferred to Phase 3 (Postgres FTS).
- Chunked/resumable uploads — deferred to Phase 3.
- Multi-machine / HA deployment — single-VM is the v1 target.
- Map visualization of project chainage — deferred.

---

## 2. Technology Stack

The stack is chosen for two priorities: government-deployable (on-prem, no vendor lock-in, mature tooling) and Claude-Code-productive (strong types end-to-end, deterministic build).

**Backend.** Kotlin 1.9+ on JDK 21 LTS, Spring Boot 3.4+, Spring Data JPA + Hibernate 6 (JSONB via `@JdbcTypeCode(SqlTypes.JSON)`), jOOQ for complex dashboard queries that JPA struggles with, Flyway for migrations, springdoc-openapi for OpenAPI 3.1 generation, Jackson Kotlin module for JSON, networknt's json-schema-validator for dynamic form payloads, Apache POI for Excel export, Bucket4j for rate limiting, zjsonpatch for audit diffs, Spring Security with a custom `AuthenticationProvider` interface. Build: Gradle Kotlin DSL.

**Frontend.** React 18 + TypeScript with Vite, Ant Design 5.x (heavy theming for the design language shown in the project mockup), `@rjsf/core` for rendering forms from JSON Schema, TanStack Query for server state, TanStack Table for complex grids, Apache ECharts (or Ant Design Charts) for visualizations, i18next for internationalization (English only at v1, Hindi-ready), DOMPurify for any user-generated markdown rendering.

**Database.** PostgreSQL 16+, with `timestamptz` everywhere, JSONB columns for schema-as-data content, GIN indexes on filtered JSONB paths, monthly range partitioning on `audit_log` from day one, named volumes under Docker.

**Object storage.** MinIO (S3-compatible, on-prem) for file attachments. ClamAV runs as a sidecar container for blocking virus scans.

**Reverse proxy and TLS.** Nginx for TLS termination, static asset caching, and reverse proxy. mkcert for local beta certificates; an internal Railway CA cert for production.

**Observability.** Prometheus + Grafana + Loki (logs) + Promtail. All on-prem, all in Docker. Structured JSON logs via Logback's Logstash encoder. Micrometer feeds Prometheus from Spring Actuator endpoints.

**CI / tooling.** Lefthook for pre-commit and pre-push hooks; Makefile as the task runner. CI server deferred until the team grows beyond solo (then Gitea Actions self-hosted).

**Container orchestration.** Docker Compose for both dev and prod. systemd unit wraps `docker compose up` in production so the stack auto-recovers on reboot.

---

## 3. System Context

PIA Tracker is an isolated system. There are no upstream feeds, no downstream consumers, no synchronous integrations. Data enters through human input by Dy CE/Cs at construction divisions and leaves only as Excel exports for human review.

The organizational hierarchy the system mirrors is **Railway Board → Zone → Division → Project → Activity → Record**. A *project* is owned at zone/division level after the Board recommends it; it contains *activities* (instances of activity types, added as needed) that contain *records* (the unit of work — a village in land acquisition, a drawing in drawing approval, a utility item in utility shifting, and so on).

User roles map to railway designations (a stable, system-known attribute) plus orthogonal system grants for admin and PAN-India viewing. There are roughly 25 distinct designations relevant to the system, falling into eight broad categories (Construction, Electrical, S&T, Operations, Commercial, Safety, Bridge, Track, Planning, Admin). The full designation registry is seeded by Flyway and lives in `permissions.md`.

The user base for v1 is small: hundreds of Dy CE/Cs, fewer CE/Cs and CAO/Cs, a handful of EDGS/C-Is and Board-level viewers. Concurrency is modest; the data scale is moderate (low millions of records over five years). Performance work focuses on dashboard queries and audit log size, both addressed below.

---

## 4. Core Architectural Patterns

Five patterns recur across the system. Understanding them is sufficient to understand most of the codebase.

### 4.1 Schema-as-Data Forms

Form definitions are themselves data. The `form_definitions` table holds rows where each row is one version of one form (the Land Acquisition form, the GAD-Major-Bridge drawing form, the Tender Packaging form, and so on). The schema is stored as JSON Schema Draft 2020-12 in a JSONB column; the rendering hints as another JSONB column (`ui_schema_json`); the workflow association as a third (`workflow_json`).

Activity records reference the specific form-definition version they were created against. When an admin edits a form, a new version row is inserted; existing records stay bound to their original version. New records use the new version. A schema-diff classifier compares two versions and labels each change as either `BACKWARDS_COMPATIBLE` (auto-migrate: added optional field, widened type, new enum value) or `BREAKING` (rename without alias, type narrow, removed field, required-field addition). Breaking changes require an explicit Kotlin migration class in `db/data-migrations/`. Backwards-compatible changes auto-apply on next read.

This pattern means a new field on Land Acquisition (or any form) is a configuration change, not a code change and not an `ALTER TABLE`. The rule enforced by code review: **never add a column when JSONB-via-form-definition can do it.** Exceptions exist for fields that need to be queryable at high cardinality (status enums, foreign keys) — those become real columns *in addition to* JSONB, kept in sync by triggers or service code.

The full mechanism is documented in `forms.md`.

### 4.2 Workflow Engine

A single generic workflow engine handles three usage patterns:

1. **Project lifecycle.** One workflow instance per project. States: `DRAFT`, `AWAITING_CAO_ALLOCATION`, `AWAITING_CEC_ASSIGNMENT`, `ACTIVE`, `ON_HOLD`, `COMPLETED`, `DROPPED`.
2. **Record-level workflow** for short forms (tender packaging, utility shifting, temporary office space). One instance per record. States: `DRAFT`, `SUBMITTED_FOR_VERIFICATION`, `VERIFIED`, `AUTHENTICATED`, plus `SENT_BACK_TO_DYCE` and `SENT_BACK_TO_NODAL`.
3. **Section-level workflow** for long forms (land acquisition with nine sections; forest clearance with three stages). N parallel instances per record, one per section. States identical to record-level. When all sections reach `AUTHENTICATED`, the record's roll-up state becomes `COMPLETE` (derived, not stored as a separate workflow state).

The engine schema is `workflow_definitions`, `workflow_states`, `workflow_transitions`, `workflow_instances`, `workflow_history` — five tables, all configurable, all versioned. SLA days are configured per state (e.g., `SUBMITTED_FOR_VERIFICATION = 7 days`, `VERIFIED = 5 days`, `SENT_BACK = 3 days`). SLA breach is computed as `now() - entered_state_at > sla_days`. Breach triggers a dashboard counter increment and a red visual indicator everywhere the record appears; no email or auto-transition.

Backward transitions (the "send back" pattern) move the instance back to a prior state with a `sent_back_marker` flag on the instance and a comment on the transition row.

**Drawings are not in the workflow engine.** They use a separate checklist model — see Section 4.6.

The full engine spec, state diagrams per form type, and SLA defaults are in `workflow.md`.

### 4.3 Write-Time Aggregation for Dashboards

Dashboards must reflect data instantly (decision 3). Materialized views with scheduled refresh are out because of the lag. Live OLTP queries are out because they don't scale. The solution is **write-time aggregation**: when an activity record changes, the same transaction updates pre-aggregated summary rows.

Summary tables include `project_land_summary`, `project_utility_summary`, `project_forest_summary`, `project_drawing_summary`, `project_tender_summary`, `project_office_summary`, `zone_summary`, `pan_india_summary`. Updates are driven by domain events (`ActivityRecordSaved`, `WorkflowStateChanged`, `DrawingApproverActed`) caught by a `SummaryUpdater` service. The update is part of the originating transaction, so the dashboard cannot see stale data.

Reads on summary tables are O(1) and fast at any scale; writes carry the small overhead of updating a few summary rows in the same transaction. The trade-off is that new dashboard widgets sometimes require new summary columns or tables — accepted as a deliberate design choice, given how much it simplifies the read path.

Details and the per-activity summary table specs are in `dashboards.md`.

### 4.4 Designation + Zone + Division User Model

Every user has three orthogonal attributes: a **designation** (stable — the railway position like `SR_DEN`, `DY_CSTE`, `CE_C`), a **primary zone**, and a **primary division**. Cross-zone access for HQ officers is via a `user_zone_assignments` table that grants additional zone access.

*What* a user can do flows from their designation (designation-derived permissions, seeded by Flyway). *Where* they can do it flows from their zone/division. *On which projects* they can act flows from `project_assignments` rows (which users are assigned to a project as CAO/C, CE/C, Dy CE/C, or Nodal Dy CE/C).

Every user-selection picker in the UI runs through a `UserPickerService` that applies the same filter logic: by designation, by zone (with cross-zone grants), and where applicable by project-assignment membership. The full picker filter matrix is in `permissions.md`.

When a user transfers zones, their `primary_zone_id` updates and new picker queries reflect the change; *existing* project assignments and drawing approver assignments persist (decision HHHH). The user can complete in-flight work in the old zone; admin can swap them out explicitly if needed.

### 4.5 Audit, Soft Delete, and Versioning

Three intertwined patterns govern data history.

**Audit log.** Every write to an audited entity produces one row in `audit_log` with the actor, action, entity reference, before snapshot, after snapshot, and computed JSON Patch diff. Captured by a Spring AOP interceptor on a `@Audited` annotation. The table is partitioned by month from day one; partitions older than 24 months are detached and archived to compressed CSV cold storage. The table is append-only — a Postgres trigger blocks UPDATE and DELETE. A monthly hash-chain integrity check verifies the log hasn't been tampered with.

**Soft delete.** Every domain table has `is_deleted`, `deleted_at`, `deleted_by`. Hibernate annotations (`@SQLDelete`, `@SQLRestriction`) make this transparent — application code never has to filter explicitly. Retention is per-entity-type: most data is never auto-purged (government record-keeping requirement); notifications are hard-deleted after 90 days; trash-binned items are purged after 30 days if not restored.

**Versioning.** Two kinds: form-definition versions (Section 4.1) and entity-row versions for optimistic locking. Every entity carries a `version` integer (Hibernate `@Version`); the API surfaces this as an ETag header. Updates require an `If-Match` header; mismatch returns 409 Conflict. This catches concurrent edits by two Dy CE/Cs on the same record — last save no longer wins.

### 4.6 Drawing Approver Checklist (Separate from Workflow Engine)

Drawings don't use the workflow engine. Each drawing record has a list of required approvers stored in `drawing_approvers` rows: `(activity_record_id, approval_designation_code, user_id, status, acted_at, comment, position)`. The drawing's overall state is **derived** from these rows: `DRAFT` until submitted, then `IN_APPROVAL` until all rows are `APPROVED`, becoming `APPROVED` when the last one flips. `SENT_BACK` is a transient state when any approver returns it with comments.

Approval order is not enforced. Any approver can act at any time. Multiple approvers can be pending simultaneously, and the same drawing can appear in multiple users' inboxes at once.

The default approver list per drawing type is stored as **designation codes** in the form definition (e.g., ESP defaults to `DY_CE, DY_CEE, DY_CSTE, SR_DEN, SR_DEN_CO, SR_DOM, SR_DEE_TRD, SR_DSTE, SR_DCM, ADRM, DRM, CE_PLANNING`). At drawing creation, designation codes resolve to specific users via the zone/division filter. After resolution, `drawing_approvers` rows reference users directly — they don't dynamically re-resolve. Editable post-creation by Admin, project CE/C, or Nodal Dy CE/C only (decision AAAA).

Editing the list preserves existing `APPROVED` statuses; new approvers added go in as `PENDING`; removed approvers' rows are soft-deleted but visible in audit history. Send-back from any approver doesn't reset others (decision CCCC).

Full schema and state derivation logic in `workflow.md` § Drawings.

---

## 5. Data Model Overview

The full schema lives in `database.md`. This section gives the topology.

```
zones ──── divisions
   │            │
   └────────────┴──── users ── designations
                       │
                       └─── user_zone_assignments (cross-zone)

projects ── project_assignments ── users
   │
   └── project_activities ── activity_records ── workflow_instances ── workflow_history
                                  │                   │
                                  │                   └── drawing_approvers (only for drawings)
                                  │
                                  └── attachments (MinIO references)

form_definitions (versioned, JSONB schema)
workflow_definitions ── workflow_states ── workflow_transitions

audit_log (partitioned monthly)
comments (polymorphic over project/activity/record)
notifications (per user, in-app only)

project_*_summary tables (write-time aggregation)
zone_summary
pan_india_summary

permissions ── role_permissions ── roles
designation_default_permissions
user_permissions (ad-hoc grants)
```

Three concentric layers of identity work together: **structural** (zones, divisions, designations, users), **transactional** (projects, activities, records, workflow instances, drawing approvers, attachments), and **derived/operational** (summary tables, audit log, comments, notifications, history).

The configuration layer (`form_definitions`, `workflow_definitions`, `permissions`, `dashboard_definitions`) sits orthogonally — these tables hold the rules that govern the transactional tables' behavior. They are versioned where it matters (forms, workflows), seeded by Flyway where it doesn't (permissions, designations).

---

## 6. UI Architecture

The shell is consistent across the application: a persistent top bar (logo, role switcher for dummy auth, notification bell, user avatar), a persistent left sidebar (Dashboard, My Inbox, Projects, Reports, Admin), and a main content area whose internal layout varies by page archetype. Two distinct right-side regions exist in the system, and they are not the same thing:

- **Within-main detail pane.** Lives *inside* the main content area on the Tree Master-Detail archetype (the Projects view). The main area starts full-width tree; on clicking a project or activity node, the area splits into a tree on the left (~40% width) and a detail pane on the right (~60% width). Dismissable to return to full-width tree. The pane shows context for the selected node (overview, summary cards, sub-records list, etc.) — see Archetype 2 below.
- **Shell-level right panel.** A separate dockable panel that appears alongside the main area on the Record Edit Page archetype. Shows tabs for Comments, History, and Workflow as the user fills out a record. Collapsible.

The two regions never coexist on the same page: the Tree view doesn't show the shell-level right panel, and the Record Edit page doesn't have the within-main split. The user's mental model is simply "context-relevant content opens on the right when there's a need."

Eight page archetypes cover the entire application:

1. **Inbox.** Task list with quick actions, grouped by what the user owes the system.
2. **Tree Master-Detail.** The primary navigation for projects. The main content area shows a full-width tree by default. **Clicking any project or activity node reveals a detail pane that slides in from the right edge of the main area**; the tree compresses to ~40% width and the detail pane takes ~60%. The pane is dismissable (close button or click-outside) and returns the tree to full-width. Three levels of tree — project, activity, record (e.g., villages under a Land Acquisition activity, drawings under a Drawing Approval activity). Activities are grouped by type within each project, then ordered by creation date within each type group. Two view modes via toggle above the tree: Tree (primary) and Table (flat, sortable).

  The detail pane content depends on what was selected:
  - **Project node selected** — project overview header card (code, name, zone, division, lifecycle state, days since RB recommendation, progress %), a grid of activity cards (one per activity under the project, each with RAG status and key summary), plus tabs for Summary, Comments, Team, History, Documents.
  - **Activity node selected** — activity mini-dashboard with activity-type-specific summary cards (e.g., for Land Acquisition: hectares total / balance / private / govt / forest, balance length), a sortable records list with section-status icons per row, an "Add Record" button (permission-gated), and tabs for Summary, Comments, History.
  - **Record leaf node clicked** — *does not* open the detail pane. Instead, navigates away from the Tree view to the full-page Record Edit screen (Archetype 3), because the section-as-tab record-edit interface needs the full viewport width.

  Each tree node displays inline status pulled from the write-time aggregation summary tables (Section 4.3) — for example "12 of 18 villages cleared", "Stage I — In MoEF&CC", "8 of 45 shifted", "3 pending > 30 days". SLA breaches bubble up: a record-level breach surfaces a warning indicator on its parent activity node and its parent project node, so a collapsed tree still flags trouble. Tree expand state and the selected node are persisted in `localStorage` per user (Phase 1) and reflected in the URL (`/projects/{code}/activities/{activityId}`) for deep-linking and browser back/forward.
3. **Record Edit Page.** Full-page archetype for editing a single record. The main content area holds the form. **A shell-level dockable right panel sits alongside the main area** (collapsible, default open) and surfaces three tabs: Comments (with @mentions, threaded replies), History (audit timeline with JSON Patch diffs), and Workflow (current state, transition history, action buttons). For forms with multiple sections (Land Acquisition has nine, Forest Clearance has three), the form area uses vertical left tabs (`tabPosition="left"`) so all section labels remain visible at 1366×768. Section state icons appear in tab labels — blank circle (untouched), pencil (draft), paper-plane (submitted), check (verified), seal (authenticated), arrow-back (sent back). Autosave every 30 seconds while in draft state. A sticky bottom bar holds workflow action buttons (Submit Section / Submit Record / Send Back / Verify / Authenticate), each role-gated and contextually visible only when the action is valid for the current state and current user.
4. **Dashboard.** PAN India, Zone, or Project scope. Summary cards on top, charts/tables below. Filter bar; Excel export button always present.
5. **List/Index.** Users list, form definitions list, audit log list. Standard sortable/filterable table.
6. **Admin Editor.** Form definition editor (JSON Schema visual + raw modes with live RJSF preview, version diff viewer), dashboard definition editor, user management.
7. **Wizard.** Multi-step flows — Project Creation (3 steps: Identity, Scope, Documents).
8. **Print View.** Light-theme-forced, A4-sized, multi-page layout. Project summary print first (Phase 2); individual record and dashboard print deferred to Phase 3.

The mockup-driven design language is the Project Listing tree shown in early planning: clean whitespace, pill-shaped controls, soft borders, status badges with color-coded dots. Achievable in Ant Design with custom theme tokens — palette is dark navy primary, neutral grays, semantic green/amber/red for status, both dark and light themes selectable by user with `prefers-color-scheme` default.

Density is Ant Design's `middle` for forms and `small` for tables. Minimum viewport is 1366×768; layouts must not break at that resolution. Browser support is Chrome and Edge (last 2 versions); other browsers should work but aren't tested. Accessibility target is WCAG 2.1 Level AA, verified by axe-core in Playwright tests.

The detailed UI spec, page-by-page composition, picker behavior, and print stylesheet are in `ui.md`.

---

## 7. API Architecture

The API is REST over HTTPS, versioned in the path (`/api/v1`). OpenAPI 3.1 spec is auto-generated by springdoc-openapi at `/api/v1/openapi.json` and is the single source of truth — the frontend generates its typed TanStack Query client from this file, so backend and frontend types never drift.

Resources are noun-plural (`/projects`, `/activity-records`, `/form-definitions`). Workflow transitions and other state changes are **action endpoints** — `POST /api/v1/projects/{id}/allocate`, `POST /api/v1/activity-records/{id}/submit`, `POST /api/v1/drawings/{id}/approve` — that take a JSON body with `comment` and any action-specific fields. Action endpoints accept an `Idempotency-Key` header for safe retries.

Pagination follows Spring Data convention: `?page=0&size=20&sort=createdAt,desc`. List responses wrap data: `{ data: [...], page: { number, size, totalElements, totalPages } }`. Single-resource responses return the raw object. Error responses use a consistent envelope: `{ error: { code, message, details, traceId } }`.

Optimistic locking is via ETag headers. GET returns `ETag: "<version>"`; mutating requests require `If-Match: "<version>"`. Mismatch returns 409 Conflict with the current state.

Time and money: all timestamps are ISO 8601 UTC in transport; the frontend converts to IST for display. All money and area amounts are decimal strings (`"123.45"`) to avoid floating-point loss; hectares to four decimal places.

Rate limits via Bucket4j: auth endpoints 5/min/IP, action endpoints 30/min/user, exports 3/hour/user. Limits returned as `X-RateLimit-*` headers.

Conventions, endpoint catalog, error codes, and the action-endpoint listing are in `api.md`.

---

## 8. Authentication and Authorization

For v1 (and through Phases 1 and 2), authentication is **dummy auth**: a role-picker UI lets the user select which seeded user (and therefore which designation and zone) they want to operate as. There are no passwords; selection is a single click; the audit log captures everything as if the chosen user did it.

The implementation discipline is what makes this swappable. There is a `Principal` interface that exposes `userId`, `designationCode`, `primaryZoneId`, `primaryDivisionId`, `crossZoneGrants[]`, `dataEntryRoleCodes[]`, `systemGrants[]` (Admin, Board Viewer, PAN India), and `permissions[]` (the union of designation-derived and ad-hoc grants). An `AuthenticationProvider` interface produces a `Principal` from a request. The dummy implementation reads the selected user ID from a session-scoped object; the real implementation (Phase 3) is an OAuth2 Resource Server validating JWTs from Keycloak.

All authorization flows through Spring Security's `@PreAuthorize` annotations and a custom `PermissionEvaluator` that consults the Principal's permission set and the resource being acted upon. No business-logic code ever inspects roles directly — only permission codes via the evaluator. This means swapping the auth provider is a one-bean change; business code is untouched.

The full permission catalog (resource × action × scope), the designation-to-permission mapping, the picker filter matrix, and the system-grant model are in `permissions.md`.

---

## 9. Security Architecture (High-Level)

Defense in depth across the standard surfaces. HTTPS-only with HSTS and HTTP-to-HTTPS redirect at Nginx. CSP and other security headers set at Nginx. CSRF tokens via Spring Security's synchronizer-token pattern. XSS prevented by React's escaping and DOMPurify on any user-generated markdown. SQL injection prevented by parameterized queries throughout (no `createNativeQuery` with string concatenation — CI guards this).

File uploads (48 MB cap, PDFs only at v1) pass MIME-type validation, magic-byte validation, size check, and a **blocking** ClamAV scan before MinIO storage. Rate limits via Bucket4j. Secrets in Docker secrets and `.env` files, never in code, never in container images, never in git.

Session timeout 30 minutes idle, 8 hours absolute. Audit log captures security events (failed logins, permission-denied responses, admin actions) alongside data changes. The audit log itself is append-only and hash-chain verified.

Dependency scanning via OWASP Dependency-Check; container scanning via Trivy; SAST via Detekt's security ruleset and ESLint security plugin; nightly DAST via OWASP ZAP. Encryption at rest via LUKS for the Postgres data volume in production. A third-party penetration test is a required gate before production deployment.

Full threat model (STRIDE per data flow), data classification matrix, complete security control catalog, and incident response runbook are in `security.md`.

---

## 10. Deployment Architecture

Single VM, Docker Compose. The compose stack runs: Nginx (TLS termination, static assets, reverse proxy), Spring Boot backend, PostgreSQL 16, MinIO, ClamAV, Prometheus, Grafana, Loki, Promtail, and a small `cron` sidecar that runs nightly `pg_dump` and `mc mirror` to a backup volume. Only Nginx exposes ports to the host (80/443).

Two environments share one `docker-compose.yml`, differing only by `.env`:

- **Local beta** (Mode 1, decision NN). Runs on a developer laptop. Single-user usage; testers come to the desk. mkcert provides locally-trusted SSL for `https://localhost`. Resource footprint ~6 GB RAM, 4 vCPU, 50 GB disk. `make setup` automates first-run.
- **Production.** Single VM, 16 vCPU / 64 GB / 1 TB SSD target. Internal Railway CA cert. Backups go to a network-mounted volume. WAL archiving enabled for 7-day point-in-time recovery. systemd unit auto-recovers the stack on reboot.

Backups: nightly `pg_dump` (compressed, 30-day local retention + monthly snapshots retained one year), MinIO `mc mirror` to backup mount, monthly automated restore-test to a scratch volume. Audit log partitions older than 24 months detach and archive to compressed CSV. Disaster recovery: RPO 24 hours, RTO 4 hours.

Observability: structured JSON logs via Logback Logstash encoder, every request stamped with a `traceId` propagated through service calls; metrics from Spring Actuator via Micrometer to Prometheus; Grafana dashboards for JVM, Postgres, app KPIs, request latency, workflow throughput, SLA breach counts; all logs streamed by Promtail to Loki and queryable from Grafana with the same `traceId`. Alerts are **dashboard-only** at v1 — a "SLA breaches" widget on the home dashboard. Email and SMS alerts deferred to Phase 3.

Local setup, production runbook, backup/restore procedures, observability dashboards, and the seed dataset spec are in `deployment.md`.

---

## 11. Testing Architecture (High-Level)

The test pyramid: many unit tests, fewer integration tests, very few end-to-end tests. The discipline is enforced by review, not by tooling thresholds.

- **Unit tests** (JUnit 5 + AssertJ + MockK on backend; Vitest + React Testing Library on frontend) cover pure business logic — schema diff classifier, workflow engine, permission evaluator, summary updaters, form validators.
- **Integration tests** (Testcontainers with real Postgres and real MinIO) cover full API endpoints from HTTP layer to database. Most bugs are caught here.
- **Contract tests** assert the OpenAPI spec matches actual response shapes.
- **End-to-end tests** (Playwright against Chrome and Edge) cover ~10–15 critical user journeys.
- **Property-based tests** (jqwik) cover the workflow engine and schema diff classifier, where edge cases are infinite.
- **Accessibility tests** (axe-core inside Playwright) fail the build on new WCAG AA violations.
- **Performance smokes** (k6) exercise the five hottest endpoints at 50 concurrent users before each phase acceptance.

Coverage targets are 70% line for backend, 60% for frontend — reported, not gating. Flaky tests are quarantined within 24 hours and fixed within a week. Mutation testing (PITest) on the workflow engine and permission evaluator lands in Phase 3.

The detailed strategy, test data builders, naming conventions, and tooling specifics are in `testing.md`.

---

## 12. Designing for Change

Pre-Investment Activities are not a frozen domain. The forms change, the approvers change, the SLAs change, occasionally the activity types change. The architecture invests deliberately in extension points so most future changes are configuration, not code.

The major extension points:

**Form definition versioning** (Section 4.1). Adding, renaming, or removing a field on any activity form is a new `form_definitions` row, not a schema migration. The hybrid migration classifier decides what auto-applies; breaking changes drop a Kotlin migration script into `db/data-migrations/`.

**Workflow definition versioning.** Same model for state machines. In-flight instances stay on their original definition; new instances use the latest active version.

**Activity type registry.** Adding a new activity type (a new clearance category, a new tender variant, anything) is one row in `activity_types`, one row in `form_definitions`, optionally one row in `workflow_definitions`. The activity-creation dropdown reads from `activity_types` so the new type shows up immediately.

**Approver designation registry.** Adding a new approval designation is one row in `designations` with `is_approval_role = true`. It becomes available in any drawing's approver list.

**Permission registry.** Permissions are strings (`RESOURCE.ACTION.SCOPE`) seeded by Flyway data migrations. The evaluator reads the `permissions` table; nothing is hardcoded.

**Dashboard widget registry.** Dashboards are configurable — `dashboard_definitions` holds widget specs as JSONB. Adding a widget is sometimes a new aggregation column on a summary table plus a JSONB config row.

**Field-type plugins.** Custom RJSF widgets for chainage, gazette references, attachments, village references, approval-chain entries. New field type means a new React component and one entry in the widget registry; schemas refer to it via `ui:widget`.

**Validator plugins.** Cross-field business rules (e.g., "20E date must follow 20A date") live in Kotlin `Validator` implementations discovered by Spring DI per activity type. No hardcoded list.

**Feature flags.** A `feature_flags` table with `flag_name`, `enabled`, optional scope (global / zone / user). A `FeatureFlagService` consults at runtime; gating new features behind flags allows rollback without redeploy.

**i18next namespaces.** Translation files split by area; adding Hindi (or any language) is adding `hi.json` files. No code change.

**Theme tokens.** Ant Design v5 tokens isolated in a `theme/tokens.ts` file; brand refresh is a token swap.

**API versioning.** `/api/v1` is the current contract. Incompatible changes go to `/api/v2`. Old version supported six months after a new version ships.

**Migration discipline (enforced).** Flyway migrations are immutable once merged. A CI check fails the build if an existing migration file has been modified. New changes always go in new migration files. This is the single most important conviction; everything else is downstream of it.

---

## 13. Phasing Overview

Three phases, each gated by manual product-owner sign-off on a scripted end-to-end scenario.

**Phase 1 — Foundation + Land Acquisition.** Fourteen sub-phases, ~11–12 weeks. Goal: prove the architecture by building the most complex form (LA) end-to-end. If LA works, every other activity is mechanically simpler. Sub-phases land project skeleton, dummy auth, project lifecycle, the form engine, the workflow engine, the activities layer, the full LA form with section workflow, the tree master-detail UI, attachments with ClamAV, comments and notifications, audit log and history, the LA dashboard with write-time aggregation, the admin form-definition editor, and a Phase 1 integration acceptance test.

**Phase 2 — Remaining Activities.** Twelve sub-phases, ~10 weeks. Utility Shifting (master form), Forest Clearance (3-stage section workflow), Tender Packaging, Temporary Office Space, Drawing Approval (checklist model), cross-activity dashboards, PAN India and Zone dashboards, bulk transitions, SLA breach surfacing, project summary print, the slim Reports export center, and a Phase 2 integration acceptance test.

**Phase 3 — Hardening + Real Auth.** Nine sub-phases, ~8 weeks. Keycloak integration, email notifications, chunked/resumable uploads, Postgres full-text search, individual record and dashboard print views, performance hardening at scale, production deployment, user/admin documentation, and a Phase 3 integration acceptance test with third-party penetration test.

Each sub-phase ends with an explicit acceptance criterion that a human runs through manually before moving on. No "code complete" without a passing scenario. Full sub-phase list, acceptance test scripts, and dependencies are in `phasing.md`.

---

## 14. Non-Functional Requirements

**Performance budgets** (verified by k6 smokes before each phase acceptance):

- First contentful paint: < 1.5 seconds
- Time to interactive: < 3 seconds
- Form save (single record): < 500 ms
- Dashboard query (any scope): < 300 ms
- Tree expand / load: < 200 ms
- Small Excel export (single project): < 5 seconds synchronous
- Large Excel export (zone or PAN India): asynchronous job with progress indication

**Time zones.** All timestamps stored as `timestamptz` (UTC) in Postgres. UI displays Asia/Kolkata (IST). API transports ISO 8601 UTC. Frontend converts. Form date inputs are interpreted in IST.

**Internationalization.** English only at v1. All UI strings keyed in i18next from day one across namespaces (`common`, `projects`, `activities`, `forms`, `dashboards`, `errors`). Adding Hindi later is creating `hi.json` files; no code change required.

**Browser support.** Chrome and Edge, last two versions, officially tested. Other modern browsers should work; not tested. IE not supported.

**Resolution.** Minimum supported viewport: 1366×768. Layouts must not break at that size. Vertical-left tabs for long forms are specifically chosen to fit this constraint.

**Accessibility.** WCAG 2.1 Level AA. Enforced by axe-core inside Playwright tests; build fails on new violations. Keyboard navigation everywhere; status indicators never rely on color alone (icons + color); ARIA labels on every form widget; visible focus indicators on every interactive element.

**Concurrency.** Optimistic locking via ETag. Two users editing the same record produces a 409 on the second save with a clear message and a refresh action.

**Data scale envelope (5-year projection).** Roughly 500–800 active projects, 1–3 million `activity_records` rows, 10–30 million `workflow_history` rows, 50–100 million `audit_log` rows (monthly-partitioned). Index strategy in `database.md` is sized for this envelope.

---

## 15. Cross-Cutting Conventions

These are project-wide conventions that every developer (and Claude Code) follows without re-deciding.

**Types.**
Money and area: `BigDecimal` with explicit scale, never `Double` or `Float`. Hectares to four decimal places.
Identifiers: UUID v4, generated by the database (`gen_random_uuid()`), stored as `uuid` column type.
Booleans: never `null`; use a tri-state enum if absence is meaningful.

**Strings.**
User-facing: i18next keys, never inline. Server-generated user-facing messages (validation errors, etc.): also keyed, with the key in the API response and the localized rendering on the frontend.
Internal codes (state codes, permission codes, designation codes): UPPER_SNAKE_CASE, stable, never localized.

**Timestamps.**
Stored UTC, transported UTC, displayed IST. The `LocalDateTime` type is forbidden in domain models — always `OffsetDateTime` or `Instant`.

**API.**
Path: `/api/v1/...`. Resources noun-plural. Actions on resources are `POST /resource/{id}/action`.
Request body: JSON. Validation errors return 400 with field-level details. Permission failures return 403. Optimistic-lock failures return 409.
Idempotency: action endpoints accept `Idempotency-Key` header.

**Auth.**
Authorization decisions through `@PreAuthorize` + the custom `PermissionEvaluator`, never inline role checks.

**Workflow.**
State transitions through `WorkflowService.transition()` exclusively. Never write `workflow_instances.current_state_id` directly.

**Data access.**
Repository methods filter soft-deleted rows by default. Reading deleted rows requires an explicit `findIncludingDeleted` variant.

**Schema changes.**
A new field on an activity form: new `form_definitions` row, no `ALTER TABLE`.
A new column for a frequently-queried attribute: Flyway migration, plus the JSONB entry kept in sync.
A new permission: Flyway data migration adding the row in `permissions`, then assignment to roles via `role_permissions`. Never hardcoded.

**Commits.**
Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`). One logical change per commit. No commits to main; PRs only.

---

## 16. Decisions Referenced

This document operationalizes decisions from all 13 planning turns. The most architecturally significant:

| Code | Decision | Section |
|---|---|---|
| 1 | Hybrid form versioning (auto-migrate compat + migration script for breaking) | 4.1 |
| 2 | Medium-granularity audit with JSON Patch diffs | 4.5 |
| 3 | Instant dashboards → write-time aggregation | 4.3 |
| 4 | Comments mechanism (polymorphic, threaded) | §5 |
| 5 | Project Creation form for EDGS/C-I | §6 (wizard archetype) |
| 6 | Soft delete on everything | 4.5 |
| 7 | Excel export | §6, §7 |
| AA | SLA model: notifications + dashboard, no auto-transition | 4.2 |
| EE | Permission scope implication (`ALL` ⊇ `ZONE` ⊇ `OWN`) | §8 |
| FF | Completed projects locked except admin | §8 |
| KK | Dashboard-only alerts | §10 |
| LL | ClamAV blocking scan | §9 |
| NN | Local beta Mode 1 | §10 |
| SS | mkcert for local SSL | §10 |
| TTT | Activity-level lifecycle as enum, outside workflow engine | §5 |
| UUU | Slim Reports page (export center) | §6 |
| VVV | Project Creation Wizard creates empty shell only | §6 |
| WWW | Add-Activity modal fields | §6 |
| XXX | `FOREST_CLEARANCE` as one activity type; others added later | §1 |
| YYY | Drawings: one activity, mixed-type records with per-record schema/workflow refs | 4.6 |
| AAAA | Drawing approver list editable by Admin, project CE/C, Nodal Dy CE/C only | 4.6 |
| BBBB | Editing preserves existing APPROVED statuses | 4.6 |
| CCCC | Send-back doesn't reset other approvers | 4.6 |
| DDDD | Any approval-role can be added to any drawing's list | 4.6 |
| FFFF | Nodal designated by CE/C of project | §3 |
| GGGG | Default approver list by designation; resolved at drawing creation | 4.6 |
| HHHH | User transfer preserves all existing assignments | 4.4 |
| IIII | `SR_DEN` and `SR_DEN_CO` distinct designations | §3 |

All lettered decisions (A through JJJJ) trace through this document into the dedicated downstream specs.

---

## 17. Next Steps

This is the anchor. The remaining 12 documents fill in the operational detail:

1. **`database.md`** — full schema, indexing strategy, JSONB conventions, designation registry, migration discipline.
2. **`workflow.md`** — engine spec, state diagrams per form, drawings checklist model, SLA defaults.
3. **`permissions.md`** — full permissions catalog, designation-to-permission mapping, picker filter matrix, system grants.
4. **`forms.md`** — per-activity form definitions, JSON Schema conventions, reusable field types, admin editing flow.
5. **`dashboards.md`** — summary tables, dashboards per activity, Excel export specification.
6. **`ui.md`** — page archetype details, picker behaviors, theming, print stylesheet, accessibility.
7. **`api.md`** — endpoint catalog, error codes, action endpoint specs.
8. **`security.md`** — threat model, control catalog, incident response.
9. **`testing.md`** — pyramid, conventions, tooling.
10. **`deployment.md`** — local setup, production runbook, backup/restore, observability dashboards, seed data.
11. **`phasing.md`** — sub-phase breakdown, acceptance criteria, dependencies.
12. **Root `CLAUDE.md`** + per-folder `CLAUDE.md` skeletons.

Drafting proceeds in this order. Each document, once locked, is referenced from this one; if a downstream doc requires a change to architecture, it lands here first.
