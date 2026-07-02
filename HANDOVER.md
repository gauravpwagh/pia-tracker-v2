# Session Handover — PIA Tracker (data setup + UI polish + IPA date + serial fix)

Working dir: `D:\Sagar\Project\Claude\pia-tracker-beta`. Deployed locally via Docker Compose at
**https://pia.local**. This file exists so a new session resumes without re-deriving context.
Delete it once everything below is confirmed done.

## How to resume (paste this as the first message of the new session)

> Read HANDOVER.md at the root of D:\Sagar\Project\Claude\pia-tracker-beta and continue from where I left off. Keep answers short and precise.

## Environment state (as of this handover)

- Stack is **up and healthy** (`make up`). Images were rebuilt after every code change this session
  (`make build-images` → `make up`).
- **Dev loop all session:** edit → `npx tsc --noEmit` (frontend, run from `frontend/`) or
  `backend/gradlew compileKotlin` (backend) → `make build-images` → `make up`. Frontend is built
  **inside Docker** (a `pia-frontend-build` container emits the dist), so host `node_modules` aren't
  needed to run.
- Postgres talks to the app via container `pia-postgres`. Bulk DB ops this session were done with
  `docker exec -i pia-postgres psql -U pia -d pia` (note the **`-i`** — heredocs need stdin).
- **I cannot log into the app in this environment** (dummy-auth needs an interactive browser we don't
  have), so *every* change below was verified only by tsc/compile + DB queries + grepping the built
  bundle — **none was clicked through live.** First action next session: ask the user to click through
  and confirm.

## Data state

- **Users: 816 real officers + 2 system (admin, super-admin).** Imported from
  `D:/Downloads/civilpersextended.csv` via `scripts/import_users.py`. Do NOT wipe users.
- **Projects: 1 kept** — `pia.06.00.15.26.1.00.001` (user asked to keep it). All other project data was
  truncated on request.
- To wipe **projects only** (keep users) the exact command used repeatedly:
  ```bash
  docker exec -i pia-postgres psql -U pia -d pia -v ON_ERROR_STOP=1 <<'SQL'
  BEGIN;
  TRUNCATE TABLE activity_records, project_activities, project_assignments, projects,
    workflow_instances, workflow_history, notifications, comments, attachments, export_jobs CASCADE;
  COMMIT;
  SQL
  ```
  (Truncate cascades to all `*_summary` and `*_details` tables. Never truncate `users`/`user_roles`.)

## What was built/changed this session (most recent last)

1. **User import (CSV support).** `scripts/import_users.py` now reads the HRMS **CSV** (headers:
   `emp_hrms_id, employee_name, desig_code, desig_desc, zone_code, …`) as well as XLSX. It:
   - generates email as `{emp_hrms_id}@{zone_code}.railnet.gov.in` (CSV has no email column),
   - sets `employee_id = emp_hrms_id`,
   - collapses designations to the role-bearing family code (roles resolve at login from
     `designation_default_roles`, so granular codes only carry ROLE_APPROVER_GENERIC):
     `DY CE*→DY_CE_C`, `CE*→CE_C`, `CAO*→CAO_C`, `ED*/Executive Director*→EDGS_CI`.
   Result: 816 imported (516 DY_CE_C, 245 CE_C, 37 CAO_C, 18 EDGS_CI). Details in memory
   `project_pia_user_import.md`.
2. **Form-layout rework** (`frontend/src/forms/`):
   - `ChainageWidget.tsx` — **single box** (decimal km, 3 decimals = metres; stores same `km+m`
     string). Was two boxes that overflowed.
   - `PiaObjectFieldTemplate.tsx` — section is **single-column iff it has a nested *object* child**
     (e.g. SRP + Gazette); otherwise 2-per-row grid. Arrays (Forest "Queries from Approving
     Authority") do NOT force single-column — they span full width while scalars stay 2-col.
   - `PiaFieldTemplate.tsx` — full-width span for nested objects/arrays, attachment/gazette/textarea
     widgets, and long-text names (`status|comment|remark|reason|note|description|execution|summary|objection`).
     **Reverted an earlier inline-label experiment** — labels are back stacked above inputs.
3. **Record detail panel** (`frontend/src/pages/projects/RecordDetailPanel.tsx`):
   - Detail blocks are now compact plain text (`bordered={false} colon`) instead of boxed tables.
   - Drawing view: Observations + Sanction share one row (2fr/1fr grid); sanction is compact
     "Received: date".
   - ⋯ menu now has **Rename** (opens inline record-name edit via `startEditing`) + Delete.
4. **Drawing observations** (`DrawingObservationsPanel.tsx`) — heading renamed **"Queries from
   Approving Authority"** with the **Add** button on the same row (shrink-safe). **Approvers**
   (`DrawingApproversPanel.tsx`) now render 2 cards per row.
5. **Record edit page** (`frontend/src/pages/records/RecordEditPage.tsx`):
   - Fixed invalid CSS var names (`--colorBorder`→`--ant-color-border`, etc. — also in
     `SendBackModal.tsx`) → the header separator now actually renders.
   - **Details** button is solid blue (`#1565c0`).
   - **Confirm popups** (Popconfirm) added to Submit-for-verification, Verify, and Authenticate.
6. **New Project wizard** (`ProjectCreateWizard.tsx`) — added an optional **IPA date** picker (sent as
   `ipaDate` `YYYY-MM-DD`; backend already supported it). **Project list** (`ProjectsPage.tsx`) now
   shows **IPA Date** instead of Created.
7. **Backend bug fix** (`ProjectService.kt` `nextSerial`) — the serial query matched `project_code
   LIKE '<prefix>%'` but codes start with `pia.`, so it always returned `001` and the 2nd project in a
   prefix hit a `uq_projects_code` 500. Now `LIKE 'pia.' || ? || '%'`. Verified: next serial for the
   existing prefix returns `002`.

## Open / pending items

- **Live verification of ALL of the above** — nothing was clicked live. Start here.
- **Git → new repo (not done).** `origin` = `github.com/gauravpwagh/pia-tracker-beta`. User wants to
  link a **new repo on a different GitHub account**, keeping both remotes. Plan agreed:
  1. Commit current work (there are ~50+ uncommitted changes — this whole session).
  2. Create an **empty** repo on the new account (**No .gitignore, No license** — repo already has a
     `.gitignore`; a non-empty repo would reject the push).
  3. `git remote add neworigin <url>` then `git push -u neworigin main` (keeps `origin` too).
  4. Auth as the new account via PAT or SSH (Windows Credential Manager may cache the old account).
  Only **code** moves via git — not Docker images/containers or the DB (the 816 users live in a
  volume, not git; the new PC re-seeds admin/super-admin then re-imports the CSV).
- **New-PC setup:** prereqs docker/mkcert/node20/JDK21/make/git → `git clone` → `make setup` (does
  certs, hosts, .env, build, migrate, seed, up). Windows gotchas: hosts file needs admin edit
  (`127.0.0.1 pia.local`), `mkcert -install`.
- **LAN access** (explained, no code change): other PCs can't reach `https://pia.local` because
  (a) `pia.local` is only in this PC's hosts file (mapped to 127.0.0.1), and (b) the mkcert CA/cert is
  trusted only locally. Fix per client: add `192.168.0.216  pia.local` to their hosts, import this
  PC's `rootCA.pem` (`mkcert -CAROOT`) into Trusted Root, and open inbound TCP 80/443 on the host
  firewall (Private profile). nginx already publishes on `0.0.0.0`. Host LAN IP = **192.168.0.216**
  (ignore 172.25.128.1 — WSL/Hyper-V).

## Conventions to keep

- Windows checkout: shell scripts must stay LF (`.gitattributes` has `*.sh text eol=lf`) — Alpine
  containers have no CRLF tolerance.
- Roles come from `designation_default_roles` at login (see `RoleMembershipResolver.kt`) — don't
  insert `user_roles` on import; just set the right `designation_code`.
- Long UI-polish back-and-forth: expect more small, specific visual complaints; apply → tsc →
  `make build-images` → `make up` → ask user to verify.
