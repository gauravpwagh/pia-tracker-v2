# Session Handover — PIA Tracker frontend/backend polish

Working session on `D:\Sagar\Project\Claude\pia-tracker-beta`, deployed locally via Docker Compose at
**https://pia.local**. This file exists purely to resume work in a new session without re-deriving
context. Delete it once everything below is confirmed done and no longer needed.

## How to resume

Start the new session with:

> Read HANDOVER.md at the root of D:\Sagar\Project\Claude\pia-tracker-beta and continue from where I left off — verify the pending items, then keep addressing my feedback as I give it.

## Environment state

- Docker stack is up (`make up` last run successfully; all containers healthy at last check).
- Latest code is built into the running images (`make build-images` was run after every change).
- If containers aren't running, `cd D:\Sagar\Project\Claude\pia-tracker-beta && make up`.
- If you touch backend or frontend code, rebuild with `make build-images` then `make up` before
  asking the user to re-check anything — the dev workflow all session has been: edit → `tsc --noEmit`
  (frontend) / `./gradlew compileKotlin` (backend) → `make build-images` → `make up`.
- Windows checkout gotcha already fixed once: shell scripts must stay LF (`.gitattributes` has
  `*.sh text eol=lf`) — Alpine containers have no bash/CRLF tolerance. If a fresh `make setup`/`reset`
  ever fails with a role/auth error again, check for CRLF creeping back into `infra/**/*.sh`.

## What's been built (chronological, most recent last)

1. **New Project wizard** — auto-generates Project ID (`pia.<zone>.<div=00>.<planHead>.<year>.<authority=1>.<agency=00>.<serial>`)
   from Zone + Project Type as they're picked; serial fetched from new backend endpoint
   `GET /projects/next-serial?prefix=...`. Manual fields reduced to Name/Type/Zone.
2. **Workspace layout fixes** — Activity scope panel moved above filters (full width, now laid out
   horizontally), tab bar fixed height, record list narrower, project list/detail two-column grids,
   Record detail Descriptions widened to 2 columns.
3. **Project list rewritten as a real Ant Design `<Table>`** (`ProjectsPage.tsx`) — was a hand-rolled
   flex layout that kept drifting out of alignment with its header; Table guarantees column alignment
   structurally. Columns: Project | Project ID | PH No. & Name | Zone | Executing Agency | Created | Status.
   ("CAO Zone" column removed per latest feedback, replaced with "Created" date.)
4. **Multi-CE/Dy-CE assignment model** (backend + frontend):
   - Backend: `allocate()` now takes `ceUserIds: List<UUID>` + `primaryCeUserId`; new
     `designate-primary-ce` endpoint/permission (`PROJECT.DESIGNATE_PRIMARY_CE`, migration
     `V084_001__seed_project_designate_primary_ce_permission.sql`).
   - **Real bug fixed**: `project_assignments` has `unique(project_id, user_id, assignment_role)`
     with no `is_active` filter — the old "deactivate old row, insert new row" pattern for
     re-designating the same Nodal/Primary threw a 500 (unique violation). Replaced with a proper
     upsert-in-place helper (`upsertAssignment`/`deactivateAssignment` in `ProjectService.kt`).
   - Frontend: single combined modal for CE/C + Primary, and Dy CE/C + Nodal (was 3 separate modals).
     Modals now pre-populate with current assignments (so people can be deselected/changed).
   - Officer list on Overview dedups by person and orders CAO → CE (primary first) → Dy (nodal first).
5. **Record workflow / immutability**:
   - Backend now rejects PATCH/DELETE on a record once its own `recordState` is `VERIFIED` or
     `AUTHENTICATED` (previously only gated at the whole-activity level) — `ActivityService.kt`.
   - "Submit for Verification" button hidden in `RecordDetailPanel.tsx` (explicit ask: not needed
     "currently").
   - Verify requires confirmation + a best-effort mandatory-fields check (`missingRequiredFields()`
     in `RecordDetailPanel.tsx`) before enabling the button.
   - Edit button → "Edit Data"; once locked, shows "View Data" (same blue styling) which opens the
     record read-only but **keeps workflow actions visible** (so a CE/C can review before
     Authenticating) — `RecordEditor` gained a `readOnly` prop.
   - "Locked after verification" text replaced with a lock icon + tooltip.
   - Fixed several places where invalidating `['record', id]` alone left the record-list badge and
     Overview stats stale after a workflow action — now also invalidates `['records', activityId]`
     and `['activities']`.
6. **`GET /projects/{id}/history` backend endpoint added** — unions audit_log rows for the project
   itself, its activities (`entity_type IN ('ACTIVITY','PROJECT_ACTIVITY')` — codebase inconsistently
   uses both strings for the same thing), and all its records. Wired into the workspace's History tab,
   replacing the old static placeholder.
7. **Critical bug fixed**: opening Edit/View Data caused the tab to hang ("page unresponsive"). Root
   cause: `PiaFieldTemplate.tsx` looked up RJSF's default `FieldTemplate` via
   `getTemplate('FieldTemplate', registry, uiSchema)` — but the registry now has `PiaFieldTemplate`
   itself registered under that name (see `RjsfForm.tsx`), so it recursed into itself infinitely.
   Fixed by importing `Templates.FieldTemplate` directly from `@rjsf/antd` instead of resolving
   through the registry. **This shipped in the last deploy — needs live re-verification.**
8. **Two-column RJSF edit-form layout** — `PiaObjectFieldTemplate.tsx` now renders fields in a CSS
   grid (`repeat(auto-fit, minmax(260px,1fr))`); `PiaFieldTemplate.tsx` forces nested objects/arrays
   and long-text fields (name matches `/status|comment|remark|reason|note|description/i`, or
   `ui:widget === 'textarea'`) to span the full row via `gridColumn: '1 / -1'` so they don't get
   squeezed into a lopsided half-width cell next to an unrelated scalar field.
9. Misc styling: notification badges changed from red→blue (SLA-breach badge→orange), "Assign
   officers"/"Assign CE/C(s)"/"Primary CE/C"/"Assign Dy CE/C(s)" buttons all given a solid blue
   background (`#1565c0`), Overview "Project details" card now shows Zone/Project ID/PH/Length/IPA
   Date/Status, Map sidebar item opens `https://indianrailways.gov.in/index/index.html` in a new tab
   (explicit placeholder per user — "we will change later"), Utility/Drawing type pickers use full
   panel width with a minimum chip width instead of a cramped scrollable dropdown, SRP-style nested
   sections given full-row spacing, record-detail Descriptions given a visible gap between field-pairs
   in the same row (bordered-table CSS override in `theme/global.css`).

## Verification status — IMPORTANT

**Nothing in this session was clicked through live in a browser.** This environment has no way to
authenticate against the dummy-auth login (no interactive browser session was available), so every
change was verified only by:
- `npx tsc --noEmit` (frontend) — clean on every change.
- `./gradlew compileKotlin` (backend) — clean on every change.
- Grepping the deployed bundle inside the nginx container to confirm the built JS actually contains
  the fix (done for the header-alignment fix and the infinite-recursion fix specifically).

**First thing to do in the new session: ask the user to actually click through the app and confirm
each fix, starting with the Edit Data / View Data crash fix (item 7 above), since that was the most
severe bug and the fix is unverified live.**

## Known gaps / explicitly deferred (don't be surprised if asked about these again)

- Inbox vs. topbar-bell discrepancy (an item flagged notified but not showing in Inbox) — investigated
  architecturally (query looks correct, joins on `workflow_states.role_required_code`), never
  reproduced live. If raised again, ask the user for exact repro steps.
- "Executing Agency" and "CAO Zone" columns/labels are placeholders showing `CAO <zone shortname>` —
  there's no real per-zone CAO assignment model in the backend yet. User acknowledged this can wait.
- Map is a static external link, not an in-app map view — explicitly deferred by the user.
- `.gitattributes` LF-enforcement is a one-time infra fix; no further action needed unless it
  regresses.

## Next steps

1. Get the user to verify the Edit Data / View Data flow doesn't crash anymore (the infinite-loop fix).
2. Walk through their newest feedback batch (already applied in code, listed in item 9 above) and get
   confirmation, since none of it was visually verified.
3. Continue iterating on whatever feedback they give next — this has been a long back-and-forth UI
   polish session; expect more small, specific complaints rather than large new features.
