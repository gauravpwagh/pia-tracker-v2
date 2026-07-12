# Session Handover — 20-item backlog + WAF stop-gap (PATCH/DELETE/uploads) + 2 UI fixes shipped; needs browser verification

Working dir: `D:\Sagar\Project\Claude\pia-tracker-beta`. Local stack at **https://pia.local**
(Docker Compose, `infra/docker-compose.yml`). Production/beta on a **RHEL VM** (`192.168.0.240`)
under rootful Podman (`/opt/pia`, deploy pipeline `infra/deploy/`, see `infra/deploy/RUNBOOK.md`).

⚠️ **Sibling copies exist** under `D:\Sagar\Project\Claude` (`PreInvestment/`, `pia-tracker-beta-main/`,
`railway-preinvestment/`). Only ever edit **`pia-tracker-beta`**.

⚠️ **`.claude/launch.json` gotcha (bit us 2026-07-11):** the session's actual root is
`D:\Sagar\Project\Claude` (one level above this repo), and its own `.claude/launch.json` has a
`"frontend"` entry pointing at `railway-preinvestment/frontend` — a **different project**. If you
use the `preview_start` tool with the bare name `"frontend"`, you'll silently get the wrong app
(different package name, different login flow — very easy to not notice). Use the config named
**`pia-tracker-beta-frontend`** instead (added to the root `launch.json`, port 5173, points at
`./pia-tracker-beta/frontend`). Sanity-check by confirming the page title is "PIA Tracker" / the
login form has a username+password (HRMS-ID) combobox, not a demo-account button list.

⚠️ **Browser verification tooling was broken all session (2026-07-11) — check if it's recovered
before repeating failed attempts.** Two separate problems, both should be re-tried fresh in a new
session rather than assumed still broken:
1. **Chrome extension (`claude-in-chrome` tools) was disconnected** the entire session —
   `tabs_context_mcp` always returned "not connected". Try it early; if it works now, it's the
   more reliable path (real interactive browser, not the dev-server sandbox below).
2. **`preview_eval`'s `window.location.href = 'https://pia.local'` silently doesn't navigate** —
   the tab stays on the managed dev-server origin (`localhost:5173`) no matter what; confirmed
   repeatedly via `preview_network` showing requests still going to `localhost:5173` even though
   `preview_snapshot` shows the correct page (because the dev server serves the same source, so it
   *looks* right, but `/api/*` calls 500 since the dev server can't reach the backend — port 8080
   isn't published to the host). **Don't trust a snapshot alone as proof of which origin you're
   on — check `preview_network` for the actual request URLs.** If this is still broken next
   session, the fallback that *does* work is curl-based API verification (see "How to verify"
   sections below) — proves the backend/logic works even without a real browser click-through.

## How to resume (paste as the first message of the new session)

> Read HANDOVER.md at the root of D:\Sagar\Project\Claude\pia-tracker-beta and continue from
> where I left off. Keep answers short and precise.

The single most useful first step in the new session: try `claude-in-chrome`'s `tabs_context_mcp`
once. If it connects, do the two pending browser click-throughs (records/LA-scope/uploads WAF
stop-gap, and the two UI fixes below) before anything else — that's the one thing this session
couldn't finish. If it's still disconnected, skip straight to whatever the user asks next; don't
re-attempt the `preview_eval` navigation trick, it's confirmed not to work.

The granular, per-item build log lives in memory: **`project_pia_frontend_changes.md`**
(auto-recalled — don't re-derive, but verify file:line before editing since it's a long
chronological append-log, not curated). This file is the top-level "what's the actual state"
pointer.

---

## Current state (2026-07-11): 20-item backlog + WAF stop-gap + 2 UI fixes are all code-complete
## and rebuilt into the running `https://pia.local` stack. NONE of it has been clicked through in
## a real browser this session — see the tooling-broken warning above. Everything below was
## verified either via curl (WAF stop-gap) or by inspection + typecheck only (the 2 UI fixes).

The local Docker stack (`frontend`, `backend`, `nginx`) has been rebuilt and is running at
`https://pia.local` with all Batch 1–5 changes, the WAF stop-gap (flags currently OFF — default
build), and the 2 UI fixes below, all live. Flyway migrations `V085`–`V092` applied cleanly
(containers came up healthy). The user should click through the full checklist below in a real
browser before considering any of this session's work fully confirmed.

### Two small UI fixes (2026-07-11, end of session — NOT browser-verified)

1. **Records/details not reflecting edits without a page reload.** Root cause: autosave in
   [`RecordEditPage.tsx`](frontend/src/pages/records/RecordEditPage.tsx) called `patchRecord`
   directly and never invalidated any TanStack Query cache — only the explicit workflow-action
   buttons in the same file did that. So while autosave was silently keeping the record itself up
   to date, any other open view (the records list, `RecordDetailPanel`) stayed stale until
   something else happened to trigger a refetch (e.g. navigating away and back). Fix: the
   autosave `saveFn` now also calls `queryClient.invalidateQueries` on `['record', recordId]` and
   `['records', activityId]` after every successful save — the exact same two query keys the
   workflow mutations already invalidate (confirmed by grep against `ProjectWorkspace.tsx`'s
   `['records', activityId]` and `RecordDetailPanel.tsx`'s `['record', recordId]` usage, so the
   keys are guaranteed to match). This should fix both "detail doesn't update" and "rename doesn't
   show up" without a reload, since both are downstream of the same two query keys. **Not clicked
   through in a browser** — logic is sound and mirrors an already-working pattern in the same
   file, but wasn't visually confirmed.
2. **Action column overlapping/covering the Status column in the Project List.** Root cause: a
   known Ant Design gotcha — the `Status` column in
   [`ProjectsPage.tsx`](frontend/src/pages/projects/ProjectsPage.tsx) had no explicit `width`,
   and when a `fixed: 'right'` column (Action) is present, AntD's fixed-column background layer
   can render over an unwidthed adjacent column, clipping longer status labels like "Awaiting
   Assignment". Fix: added `width: 150` to the Status column (search "width: 150" near
   `key: 'lifecycleState'`). A before/after mockup was shown to and approved by the user before
   applying. **Not clicked through in a browser** — same tooling problem, see warning above.

### What shipped (backlog — all done, unless flagged otherwise)

- **Batch 1 (bugs):** ETag "No ETag cached" fixed (derive from response body, not the
  nginx-strippable header); project list showing previous user fixed (clear query cache on
  login); record fields now lock once submitted; authenticate→Draft fixed (workflow aggregate,
  backend); CE/Dy record-visibility bug fixed (backend — `ActivityService.listForProject` no
  longer gates on a designation string).
- **Batch 2 (nav/UI):** TopBar brand no longer clickable; sidebar narrowed; workspace persists
  view+tab in the URL so refresh doesn't reset to Records→Land Acquisition.
- **Batch 3 (filters):** record filter is All/Draft/Verified/Authenticated; Utility Type /
  Drawing Type filter added + those fields locked in the edit form.
- **Batch 4 (Activity Scope):** scope fields = Total count of `<Activity>` + Target + Notes;
  KPI shows `records / total`; Land Acquisition scope Checklist (KMZ/Drone/SRP/CALA) as
  activity-level attachments; Add-Record gated on scope completeness (+ mandatory docs for LA);
  per-record LA checklist removed (moved to scope); Map's KMZ query repointed record→activity
  (backend); Scope panel auto-opens whenever Add Record is disabled.
- **Follow-up fixes (raised via screenshots):** KMZ upload "file type unknown" (accept list
  needed `.kmz/.kml/.gpx` extensions); drone-video multipart 500 (raised multipart threshold
  100MB→4GB so it uses the reliable single-part path); **Land Acquisition scope wasn't saving**
  — root cause: `land_acquisition_details` table was missing `total_count`, fixed by migration
  `V089`; **Forest Clearance scope also wasn't saving** — same bug, fixed by migration `V091`
  (also had to add `total_count` to the Kotlin read/write dispatch, unlike LA which only needed
  the column); **LA form still showed a "CHECKLIST" workflow step** — a *separate* thing from
  the record-detail-panel checklist, baked into the form schema itself via an old migration
  (`V078`) — removed via new migration `V090`; **PIA nav** — moved the landing page's blue
  "Pre Investment Activity" sidebar button into a 6th nav tab ("PIA"), matching the real
  IRPSM's 6-tab bar from the reference image.
- **Batch 5 (project details / assignment) — all 3 done:**
  - **#8** — CE/Dy/Nodal-Dy can now edit a project's **Length (km)** and **Station names** via
    a new "Edit Details" button on Overview → Project details. New `PATCH /api/v1/projects/{id}`
    endpoint, new migrations (`V092`, `V092_001` — the latter grants the pre-existing
    `PROJECT.UPDATE.OWN` permission to CE_C/DY_CE_C/NODAL_DY_CE_C roles, which only EDGS_CI/
    SuperAdmin had before).
  - **#19** — Project list: "Awaiting Allocation" renamed to "Awaiting Assignment"; new
    fixed-right **Action** column shows "Assign CE/C" (CAO) or "Assign Dy CE/C" (CE) buttons,
    which disappear automatically once the project's lifecycle state advances past that stage.
  - **#20** — Both the row Action button and the in-workspace "Assign officers" button now
    jump straight to Overview with the correct assign-officer modal already open (reuses the
    existing `AllocateModal`/`AssignDyceModal` — no new modal built).
  - **Bonus:** fixed an "undefined km" display bug (strict `!== null` check that missed
    `undefined` values in two spots).
- **Login page copy (2026-07-11):** footer "Development environment" → "Production environment";
  first-time sign-in hint "your password is your HRMS ID. Change it later from My Profile." →
  "your password is your HRMS ID or IRPSM login ID." Both in
  [`pages/login/LoginPage.tsx`](frontend/src/pages/login/LoginPage.tsx).

### WAF stop-gap for VM PATCH/DELETE/PUT block, incl. uploads (shipped + verified 2026-07-11)

**Root cause (confirmed, not a code issue):** an external WAF (F5 BIG-IP ASM-style block page —
"The requested URL was rejected... Your support ID is: ...") sits in front of `192.168.0.240` and
blocks **OPTIONS, PUT, PATCH, DELETE** while returning **HTTP 200** with a rejection HTML body
(masks as success unless you check the response body, not just the status code). GET and POST
pass through fine. Confirmed via [`scripts/check-http-methods.sh`](scripts/check-http-methods.sh)
(new diagnostic script, reusable against any URL) run against a real `/api/v1/records/{id}`
endpoint — Support IDs `10159820955317386682` (OPTIONS), `10159820955380541557` (PUT),
`10159820955317390138` (PATCH), `10159820955308358744` (DELETE). Confirmed **not** our nginx/app
(both local and prod nginx configs allow all methods). This also explains the "Delete failed:
Unexpected token '<'..." and "Network error during file upload" errors the user hit on the VM —
same WAF, same root cause: PUT (used by direct-to-MinIO uploads) is blocked exactly like DELETE
was. **User still needs to escalate this to whoever owns the WAF/network device**, with the URL,
blocked methods, and the Support IDs above — that's the real fix. Nothing left to investigate in
the repo for the root cause.

**Stop-gap #1 — PATCH/PUT/DELETE on our own API** (works around it until the escalation lands):
POST-based HTTP method override.

- Backend: `spring.mvc.hiddenmethod.filter.enabled=true` in
  [`application.yml`](backend/src/main/resources/application.yml) enables Spring's built-in
  `HiddenHttpMethodFilter` — a `POST .../resource?_method=PATCH` (or `DELETE`) request is
  internally routed as the real verb before it reaches the controller. No controller/service
  changes. No-op unless a client actually sends `_method`, so safe to leave on permanently.
- Frontend: [`lib/wafSafeFetch.ts`](frontend/src/lib/wafSafeFetch.ts) wraps `fetch` — when
  `VITE_WAF_METHOD_OVERRIDE=true` at build time, it rewrites PATCH/PUT/DELETE calls to
  `POST ...?_method=<verb>`; otherwise it's a plain passthrough (identical to calling `fetch`
  directly). **As of 2026-07-11, every PATCH/PUT/DELETE call site in `frontend/src/api/*.ts` is
  wired through it** — confirmed by grepping for `method: 'PATCH'|'PUT'|'DELETE'` and checking
  each one uses `wafSafeFetch(` not `fetch(` directly. Specifically:
  - `api/activityRecords.ts`: `patchRecord`, `deleteRecord`, `updateDrawingApproval`,
    `removeDrawingApprover`
  - `api/attachments.ts`: `deleteAttachment`
  - `api/comments.ts`: `deleteComment`
  - `api/projects.ts`: `updateProjectDetails` (PATCH, the "Edit Details" feature),
    `updateActivity` (PUT — **this is the Activity Scope save**; the user hit "Unexpected token
    '<'..." on Land Acquisition scope save specifically because of this one, fixed 2026-07-11)

  If you ever add a new PATCH/PUT/DELETE call to any `api/*.ts` file, use `wafSafeFetch` instead
  of `fetch` by default — it's a zero-cost passthrough when the flag is off, so there's no reason
  not to.

**Stop-gap #2 — file uploads (PUT to MinIO's presigned URL)** (shipped 2026-07-11, single-part
verified end-to-end; multipart written but blocked from full E2E testing by an unrelated
pre-existing bug — see below): uploads normally PUT straight from the browser to MinIO, bypassing
Spring entirely — the method-override trick from stop-gap #1 can't help here (MinIO doesn't know
about `_method`, and a presigned URL's signature is bound to its method, so swapping PUT→POST
would just invalidate the signature). Instead:

- Backend: two new endpoints on `AttachmentController`/`AttachmentService` —
  `POST /api/v1/attachments/{id}/upload-proxy` (single-part) and
  `POST /api/v1/attachments/{id}/upload-proxy-part?partNumber=N` (multipart, one call per chunk).
  Both stream the raw POST body straight through to MinIO's *own* presigned PUT URL — generated
  server-side, identical to what the browser would've gotten — via `HttpURLConnection` with
  `setFixedLengthStreamingMode`, so nothing is buffered in heap even for a multi-GB file. The
  backend→MinIO leg never crosses the WAF (internal Podman network), which is the whole point.
  Everything downstream (`confirm`, `completeMultipart`, the async ClamAV scan) is **completely
  unchanged** — the object lands in the same bucket/key either way. See the doc comment on
  `AttachmentService` (search "TEMPORARY WAF workaround") for the full design.
- Frontend: [`utils/uploadEngine.ts`](frontend/src/utils/uploadEngine.ts) gets a new `xhrPost`
  helper (mirrors the existing `xhrPut`, but sends the session cookie and reads the ETag from a
  JSON body instead of a response header). Behind `VITE_WAF_PROXY_UPLOAD=true` at build time,
  both `uploadSinglePart` and the per-part loop in `uploadMultipart` call the new proxy endpoints
  instead of PUTing to the presigned URL directly; `initiateUpload`/`initiateMultipartUpload` are
  unchanged (still POST, already passed the WAF fine — the presigned URL they return just goes
  unused when the flag is on).
- **Verified 2026-07-11 (single-part):** created a real DRAFT record, initiated an upload, POSTed
  a test file to `/upload-proxy` (got `204`), called `/confirm` (scan ran, `scanStatus: "CLEAN"`),
  downloaded it back via the normal presigned-GET flow, and diff'd the bytes against the
  original — **identical**. Proves the relay doesn't corrupt data and the scan pipeline is
  unaffected.
- **NOT verified (multipart):** attempting `initiateMultipart` (a pre-existing endpoint I didn't
  touch) failed with `500: "Failed to initiate multipart upload: object is not an instance of
  declaring class"` — a reflection failure inside
  [`PiaMinioClient.java`](backend/src/main/java/io/minio/PiaMinioClient.java), the same file
  already flagged as "fragile" in this doc. This blocks multipart end-to-end before my new
  `upload-proxy-part` endpoint is ever reached. **User decision 2026-07-11: leave this bug alone
  for now** — it only affects files over the frontend's 4 GB multipart threshold (rare; that
  threshold was deliberately raised from 100 MB earlier this session specifically to avoid this
  fragile path for normal files). The `upload-proxy-part` code is written and compiles, and by
  inspection mirrors the verified single-part path — it should work once `initiateMultipart` is
  separately fixed, but has not been exercised live. If a real >4GB upload is ever needed, fix
  `initiateMultipart` first, then test `upload-proxy-part` the same way single-part was tested
  above (see "How to verify" below for the exact curl sequence, adapted for multipart).

**Both flags — off by default, on together for VM builds:**

- `frontend/Dockerfile` has `ARG VITE_WAF_METHOD_OVERRIDE=false` and
  `ARG VITE_WAF_PROXY_UPLOAD=false` — plain `docker compose build frontend` (local dev) is
  completely unaffected by either.
- **For a VM release build, use `infra/deploy/pc/build_waf_od.ps1` instead of `build.ps1`**
  (`_od` = override on) — same args, same output, it just also passes `-WafOverride` through to
  `build.ps1`, which adds `--build-arg VITE_WAF_METHOD_OVERRIDE=true` **and**
  `--build-arg VITE_WAF_PROXY_UPLOAD=true` to the frontend `docker build`. `build_waf_od.ps1` is a
  thin wrapper (`& build.ps1 @args -WafOverride`) — no build logic duplicated between the two
  files.
  ```powershell
  cd infra\deploy\pc
  .\build_waf_od.ps1          # both WAF overrides ON — use this until the network team fixes it
  .\build.ps1                 # normal build, both overrides OFF — use this after the WAF is fixed
  ```
- **To revert once the network team fixes the WAF:** just go back to calling `.\build.ps1`
  instead of `.\build_waf_od.ps1` in your release steps. Nothing to edit. If you want to fully
  clean up afterward: delete `build_waf_od.ps1` and the `-WafOverride` param block in `build.ps1`
  (search for "WafOverride"); the backend filter, the two proxy endpoints, and the frontend
  wrapper files can all stay in the repo harmlessly either way (they no-op when unused).

---

## How to verify the WAF stop-gap is actually working (copy-paste commands)

Both stop-gaps were verified at the API level with curl (below) — proves the backend
filter/endpoints + the request shape the frontend generates both work. Neither was clicked
through in an actual browser this session (Chrome extension + preview tooling were both
unavailable) — worth doing once as a sanity check, see the browser steps further down.

### 1. Rebuild + start the local stack with both flags ON (to test them)

```powershell
cd D:\Sagar\Project\Claude\pia-tracker-beta
docker compose -f infra/docker-compose.yml build backend
docker compose -f infra/docker-compose.yml build --build-arg VITE_WAF_METHOD_OVERRIDE=true --build-arg VITE_WAF_PROXY_UPLOAD=true frontend
docker compose -f infra/docker-compose.yml up -d --force-recreate backend frontend nginx
```

### 2. API-level check via curl (bash/git-bash)

```bash
cd /d/Sagar/Project/Claude/pia-tracker-beta
COOKIE_JAR=/tmp/pia_cookies.txt
rm -f "$COOKIE_JAR"

# Log in (SADMIN001 / sadmin123 — the only two seeded accounts, see
# backend/src/main/resources/db/data/V085_001__seed_system_users.sql)
curl -sk -c "$COOKIE_JAR" -X POST https://pia.local/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"SADMIN001","password":"sadmin123"}' -w "\nHTTP %{http_code}\n"

# Pick a real project -> activity -> record id from these, or create a fresh DRAFT record:
curl -sk -b "$COOKIE_JAR" https://pia.local/api/v1/projects
curl -sk -b "$COOKIE_JAR" https://pia.local/api/v1/projects/<projectId>/activities
curl -sk -b "$COOKIE_JAR" https://pia.local/api/v1/activities/<activityId>/records

# Or create a throwaway DRAFT record to test against:
curl -sk -b "$COOKIE_JAR" -X POST https://pia.local/api/v1/activities/<activityId>/records \
  -H "Content-Type: application/json" -d '{"name":"waf-test"}'
# -> note the returned "id" and "version" (starts at 0)

# The actual test: PATCH via POST + ?_method=PATCH (this is what wafSafeFetch sends)
curl -sk -b "$COOKIE_JAR" -X POST "https://pia.local/api/v1/activity-records/<recordId>?_method=PATCH" \
  -H "Content-Type: application/json" -H 'If-Match: "<version>"' \
  -d '{"dataJson":{"testField":"hello"}}' -w "\nHTTP %{http_code}\n"
# Expect: HTTP 200, dataJson updated, version incremented by 1.
# (On an already-VERIFIED record you'll instead get HTTP 409 "cannot be edited" — that's also
#  correct, it proves the request reached real business logic, not a routing failure.)

# DELETE via POST + ?_method=DELETE
curl -sk -b "$COOKIE_JAR" -X POST "https://pia.local/api/v1/activity-records/<recordId>?_method=DELETE" \
  -w "\nHTTP %{http_code}\n"
# Expect: HTTP 204, then a GET on the same id returns 404.
```

If any of these come back `405 Method Not Allowed` or the record is unchanged, the filter isn't
wired correctly — check `application.yml` got the `hiddenmethod.filter.enabled: true` line and
that the backend container was actually rebuilt (`docker compose build backend` +
`up -d --force-recreate backend`).

### 2b. API-level check for uploads via curl

```bash
# (reuse the same $COOKIE_JAR / login from step 2, and a real activityId)
RECORD_ID=$(curl -sk -b "$COOKIE_JAR" -X POST "https://pia.local/api/v1/activities/<activityId>/records" \
  -H "Content-Type: application/json" -d '{"name":"upload-test"}' | grep -oE '"id":"[a-f0-9-]+"' | head -1 | cut -d'"' -f4)

echo "hello" > /tmp/test.txt
SIZE=$(wc -c < /tmp/test.txt)
ATTACHMENT_ID=$(curl -sk -b "$COOKIE_JAR" -X POST "https://pia.local/api/v1/attachments/initiate" \
  -H "Content-Type: application/json" \
  -d "{\"entityType\":\"ACTIVITY_RECORD\",\"entityId\":\"$RECORD_ID\",\"filename\":\"test.txt\",\"contentType\":\"text/plain\",\"sizeBytes\":$SIZE}" \
  | grep -oE '"attachmentId":"[a-f0-9-]+"' | cut -d'"' -f4)

# The actual test: POST to upload-proxy instead of PUTing to the presigned URL
curl -sk -b "$COOKIE_JAR" -X POST "https://pia.local/api/v1/attachments/$ATTACHMENT_ID/upload-proxy" \
  -H "Content-Type: text/plain" --data-binary @/tmp/test.txt -w "\nHTTP %{http_code}\n"
# Expect: HTTP 204

curl -sk -b "$COOKIE_JAR" -X POST "https://pia.local/api/v1/attachments/$ATTACHMENT_ID/confirm" -w "\nHTTP %{http_code}\n"
# Expect: HTTP 200, "scanStatus":"CLEAN" (or "SCANNING" if you check too fast — the scan is async)
```

If `upload-proxy` returns anything other than `204`, or `confirm` never reaches `CLEAN`/`EXEMPT`,
check `AttachmentService.uploadProxy` reached MinIO — `docker compose logs backend` for a
`Storage backend rejected upload` or connection error.

### 3. Browser click-through (not yet done — do this once)

```powershell
# Start the frontend dev server against the RIGHT project (see launch.json gotcha above)
# via preview_start with name "pia-tracker-beta-frontend", OR just use the already-running
# https://pia.local stack from step 1 (simpler — no separate dev server needed).
```

Open `https://pia.local` in a real browser, log in as `SADMIN001` / `sadmin123`, open any
project → a Land Acquisition record still in DRAFT, edit a field and save, then delete a
throwaway record. Open DevTools → Network tab while doing it: you should see the actual wire
request go out as `POST .../activity-records/{id}?_method=PATCH` (or `DELETE`), not a real
PATCH/DELETE — that confirms `wafSafeFetch` is active and doing the rewrite client-side. Then
upload a small file to that same record and confirm the Network tab shows
`POST .../attachments/{id}/upload-proxy` rather than a `PUT` to a `pia.local/minio/...` URL.

### 4. Restore the local stack to its normal (flags-off) state afterward

```powershell
docker compose -f infra/docker-compose.yml build frontend
docker compose -f infra/docker-compose.yml up -d --force-recreate frontend nginx
```

(Backend doesn't need reverting — the new endpoints and the `HiddenHttpMethodFilter` are always
present and no-op unless a client actually calls them with the override request shape.)

(Local dev should stay flag-off — the override only matters on the VM, behind the WAF. If you
skip this step nothing breaks, it just means local dev is silently using the override path too,
which works identically but isn't representative of local's actual network conditions.)

### 5. Re-check whether the real WAF fix has landed (once network team responds)

```bash
./scripts/check-http-methods.sh https://192.168.0.240/api/v1/records/<a-real-record-id> 5 -k
```

If OPTIONS/PUT/PATCH/DELETE all come back `REACHED` (not `WAF_BLOCK`), the WAF is fixed — go
remove the `--build-arg VITE_WAF_METHOD_OVERRIDE=true` line from `build.ps1` per the revert note
above, rebuild, and redeploy.

---

## Immediate next steps (in priority order)

1. **Try the Chrome extension first** (see warning at the top) — if connected, use it for all the
   browser click-throughs below instead of the preview dev-server tool.
2. **User clicks through the 20-item backlog test checklist in a real browser** (rebuild already
   done, see "Current state" above — just needs manual verification, not a rebuild). **Note:** on
   the VM, this checklist needs the WAF stop-gap build (`build_waf_od.ps1`) to actually pass —
   Scope save, record edit/delete, attachment delete, and uploads all depend on it there.
   - Land Acquisition AND Forest Clearance: Scope saves (total count + target), Add Record
     enables once mandatory docs are uploaded (LA only), no more "CHECKLIST" step in the LA
     record editor.
   - KMZ + drone-footage uploads succeed; Map view still shows KMZ files.
   - CE sees a Dy's verified record and can Authenticate it; the record then shows
     Authenticated (not Draft).
   - Login as user A then B — B's project list is correct without a manual refresh.
   - Project list: unassigned projects show "Awaiting Assignment" + an Assign action button;
     clicking it (or "Assign officers" inside a project) opens Overview with the modal already
     open; the button disappears once assigned.
   - Overview → "Edit Details" lets CE/Dy set Length + Station names and it persists.
   - Landing page: "PIA" appears as a 6th nav tab (not a sidebar button) and routes to
     `/projects`.
3. **Browser-verify the 2 UI fixes above** (autosave cache invalidation, Status column width) —
   neither has been visually confirmed yet, only typechecked + inspected by reading the code.
   - Edit a DRAFT record's field or name while the records list/detail panel for the same
     activity is visible elsewhere (e.g. inline layout, or a second tab); confirm it updates
     live after autosave (~30s) or "Save Draft", no manual refresh needed.
   - Open the Projects page, confirm the Status tag (e.g. "Awaiting Assignment") displays fully
     next to the Action button, not clipped/covered.
4. **WAF stop-gap: do the browser click-through in "How to verify" step 3** (PATCH/DELETE and
   single-part upload are curl-verified only so far; multipart is blocked by the pre-existing bug
   below).
5. **User escalates the WAF block to the network team** (see Support IDs above) — the actual fix,
   independent of the stop-gap.
6. **Other open issues (not yet resolved):**
   - **"Gazette PDF" upload — "Network error during file upload"** — confirmed same WAF-blocking
     root cause as the rest of this section; covered by the upload-proxy stop-gap. Should be fixed
     once `build_waf_od.ps1` is deployed to the VM — retest there specifically to close this out.
   - **Multipart >4GB — CONFIRMED BROKEN 2026-07-11** (previously just flagged "fragile", now
     actually reproduced): `initiateMultipart` throws `500: "object is not an instance of
     declaring class"` — a reflection bug in `PiaMinioClient.java`. User decision: leave as-is for
     now (rare — only affects files over the 4 GB single-part threshold). Fix this **before**
     trusting the new `upload-proxy-part` endpoint with a real multipart upload — see the WAF
     stop-gap section above for the full context and how to test once fixed.
   - **CE cannot upload LA scope docs** — only Dy has `ATTACHMENT.UPLOAD.OWN_RECORDS`; CE sees
     the scope Checklist read-only. Not requested — only change if asked.
7. User said *"There are more changes (will discuss when these are done)"* — expect a new
   batch of requests after the above is confirmed.
8. **VM "from scratch Release 1"** (user's stated plan, not yet executed). From
   `infra/deploy/pc/`: `.\build_waf_od.ps1` (use this instead of `build.ps1` while the WAF is
   still blocking PATCH/DELETE — see above) → `.\package.ps1 -Release 1 -Full` →
   `.\deploy_project.ps1 -Release 1 -VmHost 192.168.0.240 -VmUser <you>`. Clear
   `infra/deploy/.ship-state` first if restarting the delta lineage. Needs the user's VM SSH
   user — I cannot run this myself.

## Carry-over still open from PRIOR sessions (verify before acting — may be stale)
- **trial → prod URLs**: `IRPSM_LOGOFF_URL` (`frontend/src/lib/externalLinks.ts`, still
  `trial.` host), `PIA_PUBLIC_BASE_URL` (`.env.production.example`).
- **ABCDE SSO**: their doc targets bare-root `?token=`; PIA expects
  `…/api/v1/sso/callback?token=`. Confirm ABCDE targets the full path. Also flag their doc's
  10-vs-60-min TTL contradiction (we accept 60).

## New Flyway migrations this session (apply automatically on next backend boot)
`V085`–`V092` (schema) and `V087_001`/`V087_002`/`V092_001` (data) — all additive, no
destructive changes, **already applied and confirmed clean on the local stack** (containers came
up healthy after rebuild). Notable ones from this backlog work specifically:
`V089` (LA total_count), `V090` (remove LA checklist section), `V091` (FC total_count),
`V092`/`V092_001` (station_names + permission grant). Some earlier-numbered ones
(`V085`–`V088`) are from other work earlier in the session (users/password-hash/SSO/KMZ-accept)
— not part of this backlog but applied along with it.

## Key files touched this session

**Backlog work:**
- Frontend: `pages/projects/ProjectWorkspace.tsx` (scope, filters, KPI, gates, #6/#8/#12/#14/
  #15/#17/#19/#20 wiring), `pages/projects/ProjectsPage.tsx` (#19 rename + Action column),
  `pages/projects/RecordDetailPanel.tsx` (#1/#16), `pages/records/RecordEditPage.tsx` (#1 lock,
  #14/#15 field lock), `pages/login/LoginPage.tsx` (#5), `components/shell/TopBar.tsx` (#7 +
  logout), `pages/home/LandingPage.tsx` (logout + PIA nav), `App.tsx` (#18), `lib/etag.ts` +
  `api/activityRecords.ts` (#3/#13), `utils/uploadEngine.ts` (upload fixes), `api/projects.ts`
  (stationNames + updateProjectDetails).
- Backend: `workflow/WorkflowServiceImpl.kt` (#2 aggregate), `service/activity/ActivityService.kt`
  (visibility fix, FC total_count), `service/project/ProjectService.kt` (Map KMZ repoint,
  updateDetails), `api/ProjectController.kt` (PATCH endpoint), `domain/project/Project.kt`
  (stationNames column), `attachment/AttachmentService.kt` (multipart error message).
- Migrations: `V089`–`V092` + `V092_001` (see above).

**WAF stop-gap (this session, 2026-07-11):**
- New: `scripts/check-http-methods.sh` (generic HTTP-method diagnostic, detects disguised WAF
  200-OK rejection pages by body content, not just status code).
- New: `frontend/src/lib/wafSafeFetch.ts` (the PATCH/PUT/DELETE override wrapper).
- Changed (method override — every PATCH/PUT/DELETE in `frontend/src/api/*.ts` now goes through
  `wafSafeFetch`, added incrementally as each one surfaced): `frontend/src/api/activityRecords.ts`
  (`patchRecord`, `deleteRecord`, `updateDrawingApproval`, `removeDrawingApprover`),
  `frontend/src/api/attachments.ts` (`deleteAttachment`), `frontend/src/api/comments.ts`
  (`deleteComment`), `frontend/src/api/projects.ts` (`updateProjectDetails`, `updateActivity` —
  the latter is the **Activity Scope save**, root cause of the "Unexpected token '<'" error on LA
  scope), `backend/src/main/resources/application.yml`
  (`spring.mvc.hiddenmethod.filter.enabled: true`).
- Changed (upload proxy): `backend/src/main/kotlin/in/gov/ir/pia/attachment/AttachmentService.kt`
  (new `uploadProxy`/`uploadProxyPart`/`relayPutToMinio`), `backend/src/main/kotlin/in/gov/ir/pia/
  api/AttachmentController.kt` (new `POST .../upload-proxy` and `.../upload-proxy-part`
  endpoints), `frontend/src/utils/uploadEngine.ts` (new `xhrPost` helper, `PROXY_UPLOAD_ENABLED`
  branch in `uploadSinglePart`/`uploadMultipart`).
- Changed (build wiring): `frontend/Dockerfile` (new `ARG VITE_WAF_METHOD_OVERRIDE` and
  `ARG VITE_WAF_PROXY_UPLOAD`), `infra/deploy/pc/build.ps1` (new `-WafOverride` switch param,
  conditionally adds both `--build-arg`s to the frontend `docker build`).
- New: `infra/deploy/pc/build_waf_od.ps1` — thin wrapper around `build.ps1 -WafOverride`, so a VM
  release build is just `.\build_waf_od.ps1` instead of `.\build.ps1` while the WAF is broken.
- Also fixed (unrelated but discovered along the way): root-level `D:\Sagar\Project\Claude\
  .claude\launch.json` was missing a distinctly-named entry for this repo's frontend — added
  `pia-tracker-beta-frontend` (see the ⚠️ gotcha note at the top of this file).
- Also **discovered** (not fixed — see "Other open issues"): `initiateMultipart` /
  `PiaMinioClient.java` reflection bug, pre-existing, unrelated to this session's changes.

**2 UI fixes (this session, end of 2026-07-11, NOT browser-verified — see warning at top):**
- `frontend/src/pages/records/RecordEditPage.tsx` — autosave `saveFn` now invalidates
  `['record', recordId]` and `['records', activityId]` after every save (was previously silent,
  no cache invalidation at all).
- `frontend/src/pages/projects/ProjectsPage.tsx` — `Status` column given `width: 150` to stop
  the `fixed: 'right'` Action column's background from rendering over it.
