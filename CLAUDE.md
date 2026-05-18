# PIA Tracker — Project Orientation

You're working on **PIA Tracker**, an internal web application for Indian Railways to track Pre-Investment Activities (land acquisition, forest clearance, utility shifting, drawing approvals, tender packaging, temporary office space) for railway construction projects. It replaces fragmented Excel + email workflows with a structured system that has audit trails, real-time dashboards, and proper access control.

This file is the orientation for any session that touches this codebase. Read it first; then read the specific docs you need.

---

## Read these docs before doing anything substantive

The plan in `docs/` is the source of truth. The skeleton is intentionally thin — most of the architectural thinking is in the docs, not the code.

| Doc | Read when... |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | First doc to read. Everything else builds on it. |
| [`docs/database.md`](docs/database.md) | You're touching schema, JSONB, or summary tables. |
| [`docs/workflow.md`](docs/workflow.md) | You're touching state transitions, the workflow engine, or drawings. |
| [`docs/permissions.md`](docs/permissions.md) | You're touching auth, the permission catalog, picker filters, or anything @PreAuthorize. |
| [`docs/forms.md`](docs/forms.md) | You're adding or editing a form definition, RJSF widget, or schema migration. |
| [`docs/dashboards.md`](docs/dashboards.md) | You're touching summary tables, SummaryUpdater, dashboard widgets, or Excel export. |
| [`docs/ui.md`](docs/ui.md) | You're building a page or component. |
| [`docs/api.md`](docs/api.md) | You're adding or modifying an endpoint. |
| [`docs/security.md`](docs/security.md) | You're touching auth, audit log, attachments, or anything CSP-adjacent. |
| [`docs/testing.md`](docs/testing.md) | You're writing or reviewing tests. |
| [`docs/deployment.md`](docs/deployment.md) | You're touching docker-compose, Nginx, migration ordering, or seed data. |
| [`docs/phasing.md`](docs/phasing.md) | You're scoping work or deciding whether a feature fits the current phase. |

Each folder under `backend/`, `frontend/`, `infra/`, etc. has its own `CLAUDE.md` with folder-local conventions.

---

## Stack at a glance

- **Backend.** Kotlin 1.9+ on JDK 21. Spring Boot 3.4. Spring Data JPA + Hibernate 6 (with JSONB via `@JdbcTypeCode`). jOOQ for complex queries. Flyway for migrations. springdoc-openapi for the API spec. Apache POI for Excel. Bucket4j for rate limits. Build: Gradle Kotlin DSL.
- **Frontend.** React 18 + TypeScript on Vite. Ant Design 5.x (themed; see `frontend/src/theme/tokens.ts`). RJSF (`@rjsf/core`) for dynamic forms. TanStack Query + TanStack Table. ECharts. i18next. DOMPurify on user-supplied markdown.
- **DB.** PostgreSQL 16+. JSONB-heavy. GIN indexes. Audit log partitioned monthly.
- **Storage.** MinIO behind a ClamAV scan sidecar (blocking, 48 MB cap on PDFs).
- **Infra.** Nginx (TLS, static, reverse proxy). Docker Compose on a single VM. Prometheus + Grafana + Loki + promtail. mkcert in dev/local.

Theme: dark navy primary (`#1e3a5f`), light + dark variants ship from day one. See `docs/ui.md` § 2.

---

## How the system is shaped (the key patterns)

Internalize these five — they're the difference between code that fits the codebase and code that fights it.

1. **Schema-as-data forms.** Form structure lives in `form_definitions` rows (JSON Schema in JSONB), not in Kotlin classes. Adding a field to Land Acquisition is a database migration, not a code change. See `docs/architecture.md` § 4.1 and `docs/forms.md`.

2. **One generic workflow engine, three usage patterns.** Project lifecycle, record-level, and section-level all use the same engine. Workflow states / transitions live in `workflow_definitions` rows. Drawings are the **exception** — they use a separate checklist model (`drawing_approvers` table). See `docs/workflow.md`.

3. **Write-time aggregation.** Dashboards read from `project_*_summary` tables, never from raw records. Updates happen via `SummaryUpdater` in the same transaction as the originating write, triggered by domain events. See `docs/dashboards.md`.

4. **Designation + zone + division user model.** A user has a stable designation, mutable zone/division, and optional cross-zone grants via `user_zone_assignments`. The user picker filters by all three. See `docs/permissions.md` § 5.

5. **JSON Patch audit trail.** Every meaningful state change writes an `audit_log` row with before/after JSON, a JSON Patch diff, and a hash-chain pointer. The table is append-only — enforced by a trigger. See `docs/database.md` § 9 and `docs/security.md` § 3.

---

## What this app is NOT

To avoid scope creep:

- Not a project management tool (no Gantt, no resource leveling, no PM-style budgeting beyond what's needed to track activities).
- Not a financial system (no payment processing, no integration with railway accounting beyond capture-and-reference of amounts).
- Not a document management system (attachments are tied to records, not a separate hierarchy).
- Not a public-facing tool (internal Railway use only).
- Not a replacement for IRPSM, the Railway Board's official project monitoring system — PIA Tracker feeds *into* IRPSM but doesn't replace it.

---

## Quickstart for a new session

```bash
# First-time setup (10-12 min)
make setup

# Daily start
make up
make logs            # tail in another terminal

# Before pushing
make lint
make test

# Reset state when local DB gets weird
make reset           # confirms first; destroys all data
make seed            # repopulates reference + demo data
```

---

## Common mistakes to avoid (read this list when you've finished orientation)

1. **Inline role checks.** Don't write `if (principal.role == 'CE_C')`. Use `@PreAuthorize` with a permission code; the `PermissionEvaluator` is the only thing that understands roles. CI lints for this.
2. **Direct workflow state writes.** All state changes go through `WorkflowService.transition()`. Direct UPDATE to `workflow_instances.current_state_id` skips audit, summaries, and notifications.
3. **Reading raw records for dashboards.** Dashboards always read from `project_*_summary`. If a number you need isn't in a summary, **add a column to the summary table**, don't compute it on the fly.
4. **Adding form fields in Kotlin.** Form structure lives in `form_definitions`. Adding a field is a Flyway data migration inserting a new form-definition version, never a Kotlin class change.
5. **Forgetting the ETag.** Every PATCH and action endpoint requires `If-Match`. Frontend code that builds requests without an ETag is broken.
6. **Skipping ClamAV.** Every attachment goes through the scan before commit. Bypassing it (e.g., for tests) requires an explicit, gated, security-event-audited path.
7. **Hardcoding "ALL" or "PAN_INDIA" access.** Use the system grant via `user_permissions`, not a hardcoded check on a designation.
8. **Reusing `record_state` as authoritative.** The cache is on `activity_records.record_state` but the source of truth is `workflow_instances` (and, for drawings, `drawing_approvers`). When in doubt, recompute.
9. **Drawings going through the workflow engine.** They don't. Drawings use the `drawing_approvers` checklist. See `docs/workflow.md` § 5.
10. **Adding a new permission code without seeding it.** Permission codes are seeded by Flyway migration. Hard-coding them in code without the seed will fail at `@PreAuthorize` resolution.

---

## Decision log

Major architectural decisions are recorded in `docs/architecture.md` § 16 with letter codes (A through ZZZZ). When making a new decision, append it with the next letter code and reference it in the relevant doc and in the PR. This catalog is the answer to "why did we do it this way" months later.

---

## Phase tracking

The build is divided into three phases (35 sub-phases) — see `docs/phasing.md`. Each sub-phase has an explicit acceptance gate. When you start a sub-phase, read its gate before doing anything else; when you finish, ensure the gate test exists and passes. Don't skip ahead. The vertical-slice approach (Phase 1 = Land Acquisition end-to-end before any other activity) exists for a reason: it forces the foundation to be real before we generalize.

---

## When in doubt

- Search the docs in `docs/` for the topic.
- Search the codebase for similar patterns and follow them.
- If the precedent looks wrong, raise it before deviating — consistency matters more than local optimization.
- Ask the user. Don't guess on permissions, workflow rules, or anything user-facing.
