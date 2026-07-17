# Session Handover — UI polish batch + VM crash-loop triage (Flyway/MinIO) + duplicate-activity fix, all deployed to LOCAL only

Working dir: `D:\Sagar\Project\Claude\pia-tracker-beta`. Local stack at **https://pia.local**
(Docker Compose, `infra/docker-compose.yml`). Production/beta on a **RHEL VM** (`192.168.0.240`,
public hostname `pia.mnopq` via a middleman reverse proxy in front of it) under rootful Podman
(`/opt/pia`, deploy pipeline `infra/deploy/`, see `infra/deploy/RUNBOOK.md`).

⚠️ **Everything in this session was built, compiled, and verified on the LOCAL stack only.**
**NONE of it has been deployed to the VM yet.** The VM is mid-troubleshooting from a real
production incident (backend crash-looping) — see §3 below for exact VM state and next steps.
This is the most important thing to know before doing anything else this session.

⚠️ **Sibling copies exist** under `D:\Sagar\Project\Claude` (`PreInvestment/`, `pia-tracker-beta-main/`,
`railway-preinvestment/`). Only ever edit **`pia-tracker-beta`**.

⚠️ **`.claude/launch.json` gotcha:** the session's actual root is `D:\Sagar\Project\Claude` (one
level above this repo). Use the preview config named **`pia-tracker-beta-frontend`**, not the bare
`"frontend"`. The dev server **cannot reach the backend** (port 8080 isn't published to host) —
only useful for a `tsc`/build-error sanity check.

⚠️ **Chrome extension (`claude-in-chrome`) was disconnected the entire session** — every
`tabs_context_mcp` call returned "not connected". Try it early in the new session; if it's back,
use it to click through the UI changes below instead of asking the user to test everything.

## How to resume (paste as the first message of the new session)

> Read HANDOVER.md at the root of D:\Sagar\Project\Claude\pia-tracker-beta and continue from
> where I left off.

---

## 1. Frontend UI polish batch — code-complete, deployed to LOCAL, verified via tsc/eslint only (no browser click-through — Chrome extension was down all session)

All changes rebuilt into the `pia-tracker-frontend` Docker image and deployed to local
`https://pia.local` via `docker compose -f infra/docker-compose.yml build frontend && ... up -d
frontend nginx`. **User has not visually confirmed any of this in a real browser yet.**

- **[ProjectsPage.tsx](frontend/src/pages/projects/ProjectsPage.tsx)** — narrowed `Project ID`
  column to 150px, `Action` column to 92px (was 190/120). Zone filter dropdown now only lists
  zones actually present among the current `projectsQuery.data` (mirrors the existing `typeOptions`
  pattern), instead of every zone in the system regardless of whether any project uses it.
- **[ProjectWorkspace.tsx](frontend/src/pages/projects/ProjectWorkspace.tsx)** (Overview tab) — big
  restructure:
  - Removed the old 4-KPI stat-card row (Activities / Total Records / Authenticated / Overall
    Progress) entirely, along with the now-unused `StatCard` component and `allRecords`/
    `totalAuthenticated`/`overallProgress` locals.
  - **Activity Progress** cards moved from the bottom of the page to the **top** (where the KPI
    row used to be). Each card is now a flex row item (all activities fit on one line, no
    wrapping) showing **Draft → In verification → Authenticated → Total** stacked **vertically**
    in that order (previously a 2×2 grid with Total/Authenticated on top). The per-card
    "Authenticated %" progress bar at the bottom of each card was **removed**.
  - **Project details** and **Designated officers** are now one row side by side
    (`gridTemplateColumns: '1.8fr 1fr'`), Designated Officers being the narrower column — this
    reverts an earlier-in-session accidental full-width stretch, but note this is **narrower**
    than the very first version some sessions ago (was a plain `1fr 1fr` split with Activity
    Progress in the other cell; now it's Project Details in the wide cell since Activity Progress
    moved to the top).
  - **Scope** button: always styled light orange (`#ffe7ba` bg / `#ffd591` border), regardless of
    saved state or active/inactive mode (earlier in session this was conditional on `!scopeSaved`
    — user asked for "always" on a later message, so it's unconditional now).
  - **Sub division/taluka** button: always light green (`#d9f7be` bg / `#b7eb8f` border),
    regardless of active state.
  - **Edit Details** button (in Project Details panel): light green bg/border, same palette as
    above.
- **[Sidebar.tsx](frontend/src/components/shell/Sidebar.tsx)** — inbox unread-count badge is now a
  white circle with black text (`backgroundColor: '#fff', color: '#000'`, inset border) instead of
  Ant's default red.
- **[PiaObjectFieldTemplate.tsx](frontend/src/forms/PiaObjectFieldTemplate.tsx)** — Acquisition
  Details (Land Acquisition record form) field order fixed. Two things changed:
  1. Added a `['chainage_from', 'chainage_to']` row group and a `['district',
     'sub_division_taluka']` row group to `FIELD_ROW_GROUPS`, positioned (in array order, which is
     render order) **before** the existing `['area_hectares_private', ..., '_total']` group. Final
     visual order is now: record name row → **Chainage** → **District/Taluka** → **Area
     (Private/Govt/Forest/Total)** → remaining ungrouped fields (est_villages) — this was the
     user's explicit ask across two follow-up messages (first "area should be below district", then
     "chainage should be above district too").
  2. **Changed the group-activation logic from a plain filter to sequential dedup** (`usedFieldNames`
     Set, first-matching-group-wins) — necessary because the new 2-field `chainage_from/chainage_to`
     group is a subset of the pre-existing 3-field Utility Shifting group
     (`chainage_from/chainage_to/length_affected_km`), and without dedup both groups would match
     Utility Shifting's schema and double-render those two fields. This is a **generally safer**
     mechanism than before and shouldn't be reverted even if the specific chainage group is ever
     removed.
- **[RecordEditPage.tsx](frontend/src/pages/records/RecordEditPage.tsx)** (~line 746) — **bug fix**:
  new Land Acquisition records no longer seed `area_hectares_private/govt/forest/total` from the
  activity's Scope `metadataJson` into the record's own `acquisition_details`. Previously, a brand
  new record's Total Area (ha) field was silently inheriting the *activity-level* Scope's "Total
  Land Acquisition (ha)" number instead of starting blank — Total Area should only ever be the sum
  of *that record's own* Private/Govt/Forest (already correctly auto-computed by
  `handleFormChange`, untouched this session). **Caveat flagged to user, not yet acted on**:
  existing records created before this fix may already have the wrong seeded Total Area baked in
  — they won't self-correct until someone edits Private/Govt/Forest on that specific record
  (triggering recompute-and-overwrite). A one-off data fix for already-affected records was
  offered but not requested.

## 2. Backend — duplicate-activity fix + new admin "merge activities" feature (code-complete, compiled, deployed to LOCAL, verified healthy; NOT on VM)

### 2a. The bug
No guard existed anywhere against creating more than one `project_activities` row of the same
`activityTypeCode` on a project. Confirmed via a live VM query: a real project had **2 Land
Acquisition activities** (one with 16 records built up over 5 days, one with 1 abandoned record
from a different Dy CE/C ~6 minutes after the first) and **4 Utility Shifting activities** (one
actively used across 2 days with 2 records, three others each with exactly 1 record, all created
by the *same* user within a 33-second burst — a client-side stale-cache race, not a
cross-account issue). This surfaced to the user as multiple confusing "Activity Progress" cards
of the same type on the Overview page (§1 above didn't cause this — that's just where it's
visible; the root cause is purely backend data integrity).

Confirmed **not** a display bug: `ActivityService.listForProject()` (feeding the activities list)
already filters `WHERE NOT is_deleted` at the repository level — the duplicates are genuinely
live, non-deleted rows, not stale/deleted leakage.

Confirmed **not** a Dashboard-accuracy problem: `SummaryUpdater` (`project_activity_summary`) is
keyed by `(project_id, activity_type_code)`, not by individual activity ID — every record-created/
state-change event increments the *same* shared summary row regardless of which duplicate
activity a record lives under. So top-level Dashboard KPIs stay numerically correct even with
duplicates; the mess is purely in the Workspace's per-activity-instance card rendering, Scope/
checklist fragmentation (each duplicate needs its own KMZ/SRP/CALA uploaded separately), and
record visibility (a Dy CE/C scoped to "their" activity may not see records sitting in a sibling
duplicate).

### 2b. Important correction mid-session — read this before touching the guard again
My first attempt blocked **any** second activity of the same type outright. This was **wrong** —
there's a documented, intentional design (class doc on `ActivityService`, ~line 217-221; also a
`ActivityController.kt:91` comment) that "Phase 1 LA" / "Phase 2 LA" as **distinctly-named**
activities of the same type on one project is a deliberate supported pattern. Both comments cite
"decision YYY" — **that citation is wrong/stale**: the real decision YYY in `docs/architecture.md`
§16 is about something unrelated (Drawings' mixed-record-type architecture). Nobody has fixed this
mislabeling; flagging it here as a minor doc cleanup someone should do, not urgent.

**Corrected, final version of the guard** (what's actually in the code now): blocks creating a new
activity only when one of the **same type AND same name** (case-insensitive) already exists on the
project — not any second activity of that type. This preserves the legitimate multi-phase pattern
while still stopping the real bug, which only ever produces identically-named duplicates (the
auto-create-on-first-record path always names the new activity after the generic type label, e.g.
literally "Land Acquisition" — a deliberate second phase would be user-named something distinct).
This also directly matches what the user said earlier in the session, unprompted: "Duplicate
record names should not be allowed."

### 2c. What's actually in the code now
- **[ProjectActivityRepository.kt](backend/src/main/kotlin/in/gov/ir/pia/repository/ProjectActivityRepository.kt)**
  — new `existsByProjectIdAndActivityTypeCodeAndNameIgnoreCaseAndIsDeletedFalse(...)`.
- **[ActivityService.kt:349-365](backend/src/main/kotlin/in/gov/ir/pia/service/activity/ActivityService.kt:349)**
  (`create()`) — calls the above; throws 409 with a clear message if it matches.
- **[ActivityRecordRepository.kt](backend/src/main/kotlin/in/gov/ir/pia/repository/ActivityRecordRepository.kt)**
  — new `@Modifying` bulk-reassign query `reassignActivity(sourceActivityId, targetActivityId)`
  (moves every non-deleted record's `project_activity_id` in one UPDATE).
- **[ActivityService.kt](backend/src/main/kotlin/in/gov/ir/pia/service/activity/ActivityService.kt)**
  (~line 441, right after `create()`) — new `mergeActivities(sourceActivityId, targetActivityId,
  principal)`: super-admin-only (explicit `principal.isSuperAdmin` check, same pattern as
  `ProjectService.removeProject`), validates source ≠ target, same project, same activity type,
  both non-deleted; reassigns records via the repository method above; soft-deletes the source
  via a **raw `jdbc.update()`** (NOT direct field mutation — `ProjectActivity`'s fields are all
  `val`, per `domain/CLAUDE.md`'s "no data class, identity by id" convention; entities here get
  updated via JDBC in the service layer, mirroring the existing `deleteRecord`/`deleteTaluka`
  pattern in the same file); writes an `ACTIVITY.MERGE` audit_log row via `AuditLogWriter`
  recording `mergedIntoActivityId` + `movedRecordCount`. Deliberately does **not** touch
  `project_activity_summary` — per §2a, that table's key doesn't care which activity a record is
  under, so nothing needs reconciling there.
- **[ActivityController.kt](backend/src/main/kotlin/in/gov/ir/pia/api/ActivityController.kt)**
  (right after `createActivity`) — new endpoint `POST
  /api/v1/activities/{sourceActivityId}/merge-into/{targetActivityId}`, gated at the controller
  layer by the existing `ACTIVITY.CREATE.ASSIGNED` permission (coarse gate; the real
  super-admin-only check is inside the service, matching how `ProjectController.remove` is gated
  by `PROJECT.CREATE` as a coarse filter with the real check inside `removeProject`).

All of the above: compiled clean (`./gradlew compileKotlin`), image rebuilt, deployed to local
stack, confirmed `RestartCount=0` / `Health=healthy`. **This has not been packaged or deployed to
the VM.**

### 2d. Real duplicate-activity IDs on the VM, ready to merge once this ships there
From a live query the user ran against the VM's Postgres (project `pia.01.00.15.26.1.00.001`, all
records confirmed DRAFT-only, no submitted/verified/authenticated data, so merging is low-risk):

```
POST /api/v1/activities/e6a79b4e-c51a-4f47-910a-20af5f713314/merge-into/164d1050-1cce-4733-8007-4f714985823f   # LA duplicate → LA keeper (16 records)
POST /api/v1/activities/b000f679-ba35-416a-a975-7d3035654f3e/merge-into/bce3474e-56eb-4aac-840d-b3da06cb6507   # US duplicate → US keeper (2 records)
POST /api/v1/activities/85c008ef-7eee-4478-a51b-788fc33345a2/merge-into/bce3474e-56eb-4aac-840d-b3da06cb6507   # US duplicate → US keeper
POST /api/v1/activities/f1d2acdd-d07c-4a58-bae6-d461a5cacd44/merge-into/bce3474e-56eb-4aac-840d-b3da06cb6507   # US duplicate → US keeper
```
Call these once the merge feature is deployed to the VM, as a super admin, through the existing
authenticated session (browser devtools `fetch()`, or Postman with the session cookie) — **not**
raw SQL, per the user's explicit instruction this session.

**Last thing asked, not yet answered:** offered to add a small "Merge duplicate activities" button
in the Admin UI instead of calling the API directly. User has not responded to this yet — ask
again or just proceed with direct API calls if they'd rather not wait for UI.

## 3. VM crash-loop triage — root causes found and fixed in code; VM itself left mid-recovery

This was a real production incident on the VM (`192.168.0.240` / `pia.mnopq`), worked through this
session via the user pasting logs/query output (no direct VM access this session or ever — always
ask the user to run commands and paste output back).

### 3a. Root cause #1 — Flyway migration failure (backend crash-loop), FIXED IN CODE
`V093_001__backfill_taluka_details_from_records.sql` failed on the VM with `value too long for
type character varying(128)` — `activity_taluka_details.taluka_name` was declared `VARCHAR(128)`
in `V093__activity_taluka_details.sql`, but real VM data (migrated from what used to be an
unrestricted free-text `sub_division_taluka` field) exceeded that. **Fix**: widened the column to
`TEXT` directly in `V093__activity_taluka_details.sql` (this migration was still uncommitted this
session, so editing in place is safe — no immutability violation).

**Local reconciliation already done**: dropped `activity_taluka_details` table locally, deleted the
`093`/`093.001`/`094` rows from local `flyway_schema_history`, rebuilt backend image, confirmed
Flyway replayed all three cleanly and backend came up healthy. This was necessary because local
already had these migrations recorded with the old checksum before the TEXT edit.

**VM reconciliation — user was walked through this, status unclear at handover time.** The exact
commands given (using the VM's actual postgres container name `pia-postgres`, confirmed via
`podman ps -a --filter name=postgres`):
```bash
sudo podman exec -it pia-postgres psql -U pia -d pia -c "DROP TABLE IF EXISTS activity_taluka_details CASCADE; DELETE FROM flyway_schema_history WHERE version IN ('093','093.001');"
```
The user confirmed the table was empty (0 rows) before running this, so the drop was safe — no
real user data was ever in it (V093_001 never successfully committed on the VM, so the table was
always empty there). **Next session: check with the user whether they actually ran this and
whether the backend came up healthy afterward** — the conversation moved on to a different VM
issue (§3c) before this was explicitly confirmed fixed.

### 3b. Root cause #2 — KMZ map load / mixed content, FOUND, USER APPLIED PARTIAL FIX
User reported "Failed to parse a KMZ file" when opening the Map tab. Root cause: MinIO presigned
URLs were being generated as `http://<VM_IP>:8453/minio/...` (raw IP, HTTP) while the app itself is
served at `https://pia.mnopq/...` (a separate middleman reverse-proxy host in front of the VM) —
mixed-content block / wrong origin entirely, not a corrupt KMZ file. Confirmed the literal culprit:
`infra/deploy/.env.production.example` ships `PIA_PUBLIC_BASE_URL=http://REPLACE_WITH_HOST_OR_IP:8453`
and `MINIO_PUBLIC_ENDPOINT=http://REPLACE_WITH_HOST_OR_IP:8453/minio` as placeholders — someone had
filled these in literally with the VM's raw IP, matching an older RUNBOOK instruction that predates
the `pia.mnopq` domain being set up. `AttachmentService.kt`'s `publicUrl()` (~line 592) does a
plain `url.replaceFirst(minioProps.endpoint, minioProps.publicEndpoint)` rewrite — confirmed this
logic itself is fine; the *value* being fed into it was wrong.

**User already edited `/opt/pia/shared/.env` on the VM** to:
```
PIA_PUBLIC_BASE_URL=https://pia.mnopq
MINIO_PUBLIC_ENDPOINT=https://pia.mnopq/minio
```
(Confirmed nginx already has a `/minio/` reverse-proxy location forwarding to the internal MinIO
container — `infra/nginx/conf.d/pia.conf:71-75` — so this should work as long as the `pia.mnopq`
middleman forwards that path through rather than only allow-listing specific routes; this was
flagged as the one remaining unknown, outside this codebase's control.)

**Status at handover: restart was attempted, but got sidetracked into §3c before confirming the
KMZ fix actually worked end-to-end.** Next session should verify: (1) did the backend/grafana
restart succeed, (2) does the Map tab load KMZ files now.

### 3c. Fallout — user's own `/opt/pia` cleanup commands broke running containers
Independent of the above, the user (on their own initiative) ran:
```bash
sudo rm -rf /opt/pia/releases/release-*
sudo rm -f  /opt/pia/releases/current
sudo rm -f  /opt/pia/releases/.history
sudo rm -rf /opt/pia/images/app/*
sudo rm -rf /opt/pia/tmp/*
```
This deletes only the **app-layer release artifacts** — it does **not** touch the `postgres_data`/
`minio_data` volumes (data is safe). But it broke `pia-grafana` (and likely other containers) on
restart with `Error: getxattr /opt/pia/releases/release-002/grafana/provisioning: no such file or
directory` — because `docker-compose.production.yml`'s Grafana provisioning bind-mount
(`./grafana/provisioning:/etc/grafana/provisioning`) is a **relative path**, resolved against the
now-deleted release folder. **`podman restart` cannot fix this** — a full redeploy is required to
recreate the release folder and recreate the containers against valid paths:
```powershell
cd infra\deploy\pc
.\build.ps1
.\package.ps1 -Release 1 -Full
.\deploy_project.ps1 -Release 1 -VmHost 192.168.0.240 -VmUser <you>
```
Explained to the user this will look like a "fresh Release 1" but preserves all DB/MinIO data since
those volumes were never touched. **Status at handover: user had not yet run this redeploy.** This
redeploy, once run, would be the natural point to *also* ship the §2 (duplicate-activity fix) and
§3a (TEXT column fix) backend changes and the §1 frontend changes, all in one release — they're
all sitting in the same uncommitted working tree.

**User explicitly clarified**: they never want a full data-volume wipe (`podman volume rm
pia_postgres_data pia_minio_data`) — that option was mentioned once as a "true clean slate" caveat
but is off the table for this environment. Only the app-layer release-folder cleanup (the 5 `rm`
commands above) is something they'd reuse, and that's safe for data as long as it's followed by an
actual redeploy (not just a container restart) afterward.

## Immediate next steps for the new session (priority order)

1. **Ask the user for current VM status** — specifically: (a) did they run the DB reconciliation
   in §3a, (b) did they run the full redeploy in §3c, (c) is the backend up and healthy right now.
   Don't assume anything carried over; the VM was mid-recovery across three interleaved problems
   when this session ended.
2. **If the VM needs a redeploy anyway (§3c), pack everything in**: this session's frontend changes
   (§1), the duplicate-activity guard + merge endpoint (§2), and the taluka_name TEXT fix (§3a) are
   all uncommitted in the working tree already — a single `build.ps1` + `package.ps1 -Full` +
   `deploy_project.ps1` picks up all of it at once. No need to cherry-pick.
3. **After deploy, run the 4 merge API calls in §2d** to actually clean up the real duplicate
   activities on the VM (the code fix alone only prevents *new* ones).
4. **Verify the KMZ/Map tab loads** (§3b) once the `.env` fix is live and the backend/grafana are
   confirmed healthy post-redeploy.
5. **Answer the open question from end of session**: does the user want a "Merge duplicate
   activities" Admin UI button, or is calling the API directly sufficient? Not yet answered.
6. **Try the Chrome extension again** (`tabs_context_mcp`) before doing anything else UI-related —
   if it's back, use it to actually click through §1's changes (Overview layout, Acquisition
   Details field order, button colors) since none of it has been visually verified in a real
   browser this session, only via `tsc --noEmit` and `eslint`.
7. **Minor, non-urgent**: the "decision YYY" mislabeling in `ActivityController.kt:91` and the
   `ActivityService.kt` class doc (~line 220) both cite the wrong decision code for "multiple
   activities of the same type are intentional" — the real YYY is unrelated (Drawings). Worth a
   one-line comment fix if anyone's touching that area again, not worth a dedicated pass on its own.

## Key files touched this session

**Frontend:**
- `pages/projects/ProjectsPage.tsx` (column widths, zone filter narrowing)
- `pages/projects/ProjectWorkspace.tsx` (Overview restructure — KPI removal, Activity Progress
  move+redesign, Project Details/Designated Officers row merge, Scope/Taluka/Edit Details button
  colors)
- `components/shell/Sidebar.tsx` (inbox badge color)
- `forms/PiaObjectFieldTemplate.tsx` (FIELD_ROW_GROUPS additions + sequential-dedup rewrite)
- `pages/records/RecordEditPage.tsx` (stopped seeding area_hectares_* from Scope metadata)

**Backend:**
- `repository/ProjectActivityRepository.kt` (name-collision existence check)
- `repository/ActivityRecordRepository.kt` (bulk reassignActivity)
- `service/activity/ActivityService.kt` (create() guard rewrite, new mergeActivities())
- `api/ActivityController.kt` (new merge-into endpoint)
- `db/migration/V093__activity_taluka_details.sql` (taluka_name VARCHAR(128) → TEXT)

**Not code — VM operational state, see §3 for exact commands already given to the user:**
`/opt/pia/shared/.env` (PIA_PUBLIC_BASE_URL, MINIO_PUBLIC_ENDPOINT), VM's `flyway_schema_history`
and `activity_taluka_details` table (local already reconciled; VM reconciliation status unconfirmed
at handover), `/opt/pia/releases/` (wiped by user, needs a fresh deploy to repopulate).
