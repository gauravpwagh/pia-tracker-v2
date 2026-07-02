# Handover — Workspace / UI redesign (PIA Tracker frontend)

**Read this first, then only open the files you need.** All work is in `pia-tracker-beta/frontend`. TypeScript is clean (`npx tsc --noEmit` = 0 errors). Nothing has been verified in a running browser yet — see "Verification blocked".

---

## What this redesign delivers

A two-screen model replacing the old Tree Master-Detail:

1. **Project List** (`/projects`) — filtered list, no tree, no detail pane. Click a project → opens its workspace.
2. **Project Workspace** (`/workspace/:projectCode`) — full-screen, own chrome: shared TopBar → project bar → project sidebar (Overview/Records/History/Map) → main area.

The **design reference** is `docs/mockups/workspace-preview.html` (open in a browser). The real app should match it.

---

## Files changed (all under `frontend/src` unless noted)

| File | What changed |
|---|---|
| `components/shell/TopBar.tsx` | Navy gradient bg (`#0d3b8c→#1565c0`), white text/icons; IR logo + "IRPSM : …" wordmark + "Pre Investment Activities"; **Home** button (icon + text, white border); user dropdown = My Profile / Help / Logout; no horizontal scroll (brand truncates, actions pinned). |
| `components/shell/Sidebar.tsx` | Dark Menu, bg `#1047ae`. |
| `main.tsx` | ConfigProvider: Sider/trigger bg `#1047ae`/`#0d3a90`; Menu dark selected `#2a63d6`. |
| `stores/themeStore.ts` | Default theme = **light**. |
| `theme/tokens.ts` | Darkened light borders: `colorBorder #b4c1d4`, `colorBorderSecondary #cdd7e5`. |
| `App.tsx` | Added route `/workspace/:projectCode` (outside AppShell, inside RequireAuth) → `ProjectWorkspace` (lazy). |
| `pages/projects/ProjectsPage.tsx` | Rewritten as **filtered list** (no tree/pane). Filters in one labeled row: Search, Status (All/Initiated/Active/Done), Zone (+All), Type of Project (+All), **Reset filters**. Compact rows, bigger status pill. **Add Project gated on `PROJECT.CREATE` permission**. Row click → `/workspace/:code`. |
| `pages/projects/ProjectWorkspace.tsx` | **NEW** — the whole workspace (see below). |
| `pages/projects/RecordDetailPanel.tsx` | Added optional `onEdit` prop; Edit button calls it (inline) instead of navigating when provided. |
| `pages/records/RecordEditPage.tsx` | Refactored: default export is now a thin wrapper; the real editor is `export function RecordEditor({ recordId, layout: 'page'|'inline', onBack })`. Inline layout = compact header, sections as a `Segmented`, form full-width, no side comment/history columns. |
| `docs/mockups/workspace-preview.html` | Design reference mockup (kept in sync with decisions). |

## `ProjectWorkspace.tsx` structure
- **Project bar**: `← Back to Project list` (fills the full sidebar-width column) · project name/type/length · **Assign officers** button (gated on `PROJECT.ALLOCATE` OR `PROJECT.ASSIGN_DYCE`) · status tag.
- **Sidebar** (`#1047ae`, 180px): Overview · Records (default) · History · Map (Map is a no-op, "linked later").
- **Records view**: tabbar of the **six fixed activity types** (`ACTIVITY_TYPE_ORDER`) — icon + label + record count. **No "Add Activity" tab/wizard.** Adding an activity is invisible: clicking **Add Record** on a type with no activity yet **auto-creates the activity** (`createActivity` with the type label as name) then creates the record.
  - **Master-detail**: record list (450px, filters: Search + Status, 12px font) on the left; right pane shows the selected record's read view (`RecordDetailPanel`) OR the inline **Add Record** form (subtype for US/Drawing + name → `createRecord`, new draft lands on top and opens) OR the **Scope** inline editor (name/notes/target → `updateActivity`) OR empty state.
  - **In-place editing**: `RecordDetailPanel`'s Edit → swaps the right pane to `<RecordEditor layout="inline">`; Back returns to read view and refreshes the record list. No navigation to a separate page.
  - KPIs inline: `Total : n · Draft : n · Submitted : n · Authenticated : n`.
- **Overview view**: project details grid + designated officers (from `fetchProjectAssignments`) — currently **read-only**.
- **History view**: table shell (Date & Time · Officer · Role · Action · Details · State change · Remarks) with an info banner — **no audit API wired**.

---

## Roles / permissions (confirmed from backend seeds)
Roles: `SUPER_ADMIN, ADMIN, EDGS_CI, CAO_C, CE_C, DY_CE_C, NODAL_DY_CE_C, APPROVER_GENERIC, BOARD_VIEWER`.
- `PROJECT.CREATE` → EDGS_CI, SUPER_ADMIN. (Real RB EDGS user designation is **`EDGS_CIVIL_III`** → role `ROLE_EDGS_CI`; gate on the **permission**, never the designation string.)
- `PROJECT.ALLOCATE` → CAO_C (assign CE). `PROJECT.ASSIGN_DYCE` + `PROJECT.DESIGNATE_NODAL` → CE_C. `ACTIVITY.CREATE.ASSIGNED` → Dy CE/C.

---

## OPEN / PENDING WORK (start here next session)

1. **Officer assignment on the Overview page** (user chose Overview, not a popup). Build an inline "Officers" section: CAO adds/removes CEs and sets **primary**; CE adds/removes Dys and sets **nodal**. The "Assign officers" button currently just switches to Overview; Overview officers list is read-only.
   - **BACKEND GAP**: current API supports only **one CE** (`allocateProject`), multiple Dys (`assignDyceUsers`), one nodal (`designate-nodal` → `primaryDyceUserId`). **Multiple CEs with a primary is NOT in the schema/API** — needs a backend change (schema + endpoints) before the frontend can do it. Plan the backend change first.
2. **On-demand `createActivity`** (first Add Record) — verify it succeeds: it needs `ACTIVITY.CREATE.ASSIGNED`, sends only `{activityTypeCode, name}`. If the backend requires scope/target or rejects duplicate names, adjust.
3. **History audit-log API** — not wired on the frontend. Find/expose an audit endpoint and populate the table.
4. **Scope editor** saves name/scopeNotes/target only — type-specific activity metadata (the old wizard's per-type fields) is not editable inline yet.

---

## Verification blocked (important)
- The Claude preview server points at a **different project** (`railway-preinvestment`, via root `D:\Sagar\Project\Claude\.claude\launch.json`), NOT pia-tracker-beta. Screenshots also time out in this environment.
- The beta backend returns **500** on `/api/v1/auth/users` (not running), so login/data can't load.
- **To verify:** run the beta stack (`cd pia-tracker-beta && make up`), open its dev server, log in via a demo account, and walk the workspace. Then confirm: fixed 6-type tabs + counts, on-demand activity creation, inline Add Record → top of list, inline RecordEditor (Segmented sections at pane width), Overview officers, Add Project visible for EDGS, Assign button for CAO/CE.

## Guardrails (from CLAUDE.md)
- **No inline role checks** — gate on permission codes only.
- Server state via TanStack Query; ETag/If-Match on PATCH/actions; strings via i18n where practical.
- Only work in `pia-tracker-beta`.
