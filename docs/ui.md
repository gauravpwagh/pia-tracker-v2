# PIA Tracker — UI

**Status:** Draft v1.
**See also:** `architecture.md` § 6 (UI archetypes); `permissions.md` § 5 (picker filter matrix); `dashboards.md` (dashboard layouts).

This document specifies the user interface in detail: shell layout, the eight page archetypes, theming and design tokens, the picker behavior, the print stylesheet, and accessibility implementation notes.

---

## 1. Shell layout

The shell has three persistent zones plus contextual right-side regions.

### Top bar (height 56px)

Logo (left, links to home), application title "PIA Tracker", spacer, role switcher dropdown (dummy auth only — present in dev/beta profiles, removed in production), notification bell with unread badge, user avatar with dropdown (profile, logout, theme toggle).

### Left sidebar (width 240px, collapsible to 64px)

Menu items, role-aware:

- **Dashboard** — visible if user has `DASHBOARD.VIEW.*` for any scope. Default to highest scope they hold.
- **My Inbox** — always visible. Badge count = items pending the user's action.
- **Projects** — always visible. The Tree Master-Detail archetype.
- **Reports** — visible if user has `EXPORT.*` for any scope.
- **Admin** — visible if user has any `*.UPDATE`, `*.MANAGE`, or system-grant permissions. Section divider above.
  - Users
  - Form Definitions
  - Dashboard Definitions
  - Feature Flags
  - Audit Log (visible if `AUDIT_LOG.READ.ALL`)

Collapsed state persists in `localStorage` per user. Active route highlighted.

### Main content area

Width: viewport minus sidebar minus right-side region (if any). Internal layout varies by archetype — see § 3.

### Right-side regions

Two distinct possibilities, never coexistent on the same page:

- **Within-main detail pane** — only on Tree Master-Detail archetype. Appears as a slide-in panel from the right edge of the main content area when a project or activity node is clicked. Tree compresses to ~40% width, detail pane takes ~60%. Dismissable.
- **Shell-level right panel** — only on Record Edit Page archetype. A separate dockable panel alongside main, collapsible. Tabs: Comments, History, Workflow.

---

## 2. Theme tokens

Both light and dark themes ship at v1. Ant Design v5 token system. The token file is `frontend/src/theme/tokens.ts`.

### Color palette

```typescript
export const tokens = {
  light: {
    colorPrimary: '#1e3a5f',          // dark navy
    colorBgBase: '#ffffff',
    colorBgLayout: '#f5f7fa',         // very light gray for shell background
    colorBgContainer: '#ffffff',       // cards, panels
    colorBgElevated: '#ffffff',
    colorBorder: '#e1e8f0',
    colorBorderSecondary: '#eef2f7',
    colorText: '#1a2733',
    colorTextSecondary: '#5a6b7d',
    colorTextTertiary: '#8b9aab',
    // semantic
    colorSuccess: '#16a34a',          // green
    colorWarning: '#d97706',          // amber
    colorError: '#dc2626',            // red
    colorInfo: '#2563eb',
  },
  dark: {
    colorPrimary: '#5b8dc7',          // lighter navy for contrast
    colorBgBase: '#0f1419',
    colorBgLayout: '#1a2028',
    colorBgContainer: '#1f2731',
    colorBgElevated: '#26303c',
    colorBorder: '#2d3a4a',
    colorBorderSecondary: '#222d3a',
    colorText: '#e8eef5',
    colorTextSecondary: '#a5b4c6',
    colorTextTertiary: '#6b7c91',
    colorSuccess: '#22c55e',
    colorWarning: '#f59e0b',
    colorError: '#ef4444',
    colorInfo: '#3b82f6',
  },
  shared: {
    borderRadius: 6,
    borderRadiusLG: 8,
    fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
    fontSize: 14,
    fontSizeLG: 16,
    fontSizeSM: 13,
    fontSizeXL: 18,
    motionDurationFast: '0.1s',
    motionDurationMid: '0.2s',
    motionDurationSlow: '0.3s',
  }
};
```

Wired into Ant Design via `ConfigProvider`:

```tsx
<ConfigProvider theme={{
    algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: { ...tokens.shared, ...(isDark ? tokens.dark : tokens.light) }
}}>
```

### Theme selection

`prefers-color-scheme` for first visit. User override stored in `localStorage` as `theme: 'light' | 'dark' | 'system'`. Toggle in user avatar dropdown.

### Density

`componentSize: 'middle'` for forms. Tables use `size="small"` explicitly on the `<Table>` component. Density is not user-toggleable in v1.

### Print

Always light theme regardless of UI setting. Print stylesheet (`src/theme/print.css`) overrides:

```css
@media print {
  :root { color-scheme: light !important; }
  body { background: #ffffff !important; color: #1a2733 !important; }
  .no-print { display: none !important; }     /* sidebars, top bar, action buttons */
  .page-break { page-break-before: always; }
}
```

---

## 3. Page archetypes — detailed specs

### Archetype 1 — Inbox

Path `/inbox`. Lists items pending the current user's action.

**Tabs** (Ant Design Tabs, top):
- Awaiting your action (default)
- In progress (items you started but haven't submitted)
- SLA breached (subset of above with red flag)

**Each row:**

```
[icon] {project_code} — {activity_name} — {record_summary}    [state badge]    [pending {N}d]    →
```

Click row → opens detail screen (record edit page if it's a record-level item; tree view scoped to the project if it's a project-level allocation/assignment task; drawing review screen if drawing).

**Right-side filters:** zone, division, activity type, days-pending range.

**Empty state:** "Your inbox is clear. Nothing waiting on you." (light celebration icon).

### Archetype 2 — Tree Master-Detail

Path `/projects` (default). The primary navigation. See `architecture.md` § 6 archetype 2 for the click-to-reveal mechanic.

**Header above tree:**

```
PROJECTS                                              [Export] [+ Add Project]
{count} projects
[Search projects, activities, villages...]   [zone ▾] [division ▾] [status ▾] [target ▾]
[Tree | Table]
```

`+ Add Project` button visible-but-disabled with tooltip "Only EDGS/C-I can create projects" for users lacking `PROJECT.CREATE` (decision PPP).

**Tree row content:**

Project level:
```
▾ {icon} {project_code}  {project_name}                        {progress_bar}  {target_year}  {state_badge}  ⋯
                         · {chainage_summary}
```

Activity level (one indent):
```
  ▾ {icon} {activity_type_label}                                                  {summary_text}                    ⋯
```

Record level (two indents):
```
    {icon} {record_subtype} — {record_name}                  Pending: {role}     {days}d            {state_badge}   ⋯
```

The summary text on activity rows comes directly from `project_*_summary` tables (e.g., "12 of 18 villages cleared"). The pending/days fields come from the underlying workflow_instances.

**Selection behavior:**

- Single-click on project or activity node → highlight + open detail pane on right.
- Single-click on record node → navigate to `/records/{id}/edit` (full-page record edit).
- Double-click on any expandable node → expand/collapse.
- Click `⋯` → context menu with permission-gated actions.

**Detail pane:**

Project selected: see `dashboards.md` § 9 (Project Overview Dashboard).
Activity selected: see the activity-specific dashboard sections in `dashboards.md`.

**View modes:**

- Tree (default): as above.
- Table: flat sortable table of projects with columns from the zone dashboard table (see `dashboards.md` § 10). Same filter bar. Click row → Tree view scoped to that project.

**State persistence:** Expand state, scroll position, selected node, view mode — all in `localStorage`. URL reflects selection: `/projects/{project_code}` and `/projects/{project_code}/activities/{activity_id}`.

### Archetype 3 — Record Edit Page

Path `/records/{id}/edit`. Full-page record editing.

**Layout:**

```
┌──────────┬─────────────────────────────────────────┬────────────────┐
│          │  {breadcrumb: project > activity > rec} │                │
│          │  {record_title}            [state_badge]│   Comments     │
│ sections │  ─────────────────────────────────────  │   History      │
│          │                                          │   Workflow     │
│   SRP    │                                          │                │
│   CALA ✓ │      [form fields for current section]  │   {tab body}   │
│   20A •  │                                          │                │
│   JMR    │                                          │                │
│   ...    │                                          │                │
│          │                                          │                │
│          │ ─────────────────────────────────────── │                │
│          │ [Save Draft]   [Submit Section]         │                │
└──────────┴─────────────────────────────────────────┴────────────────┘
```

**Section nav (left)** uses Ant Design Tabs with `tabPosition="left"`. Icons in tab labels:

- ○ blank circle: untouched
- ✏ pencil: draft (some data, not submitted)
- ✈ paper-plane: submitted for verification
- ✓ check: verified
- 🔒 seal: authenticated
- ↩ arrow-back: sent back

For non-section forms (utility shifting, tender, office, drawings), this column is hidden and the form takes its width.

**Right panel** (shell-level, collapsible, default open at width ~320px):

Three tabs:

- **Comments**: threaded list, "Write a comment..." composer at top supporting markdown and @mention typeahead (picker E). New comments anchored to the current workflow state at time of post.
- **History**: chronological list of audit_log entries for this record, each expandable to show JSON Patch diff (rendered as a side-by-side diff view). Filterable by event type.
- **Workflow**: current state, role-required, days pending, list of past transitions with actor/timestamp/comment, action buttons (Submit / Send Back / Verify / Authenticate), each contextual to current state and current user's role.

**Sticky bottom bar:**

Save Draft (autosaved every 30s anyway, button shown for psychological reassurance), then primary actions based on context:

- Dy CE/C in DRAFT: "Submit Section" or "Submit Record"
- Nodal Dy CE/C in SUBMITTED_FOR_VERIFICATION: "Verify" + "Send Back"
- CE/C in VERIFIED: "Authenticate" + "Send Back"

Send Back opens a modal forcing a comment. Authenticate opens a confirmation modal (it's irreversible). Verify is inline-confirmed.

**Autosave indicator:** small text near the action bar, "Saved at 14:23" updating after each autosave.

**Concurrent edit handling:** on save, the ETag mismatch returns 409 with body `{ error: { code: "STALE", currentVersion: N }}`. Frontend shows "This record was modified by {user} at {time}. Reload to continue." with a Reload button.

### Archetype 4 — Dashboard

Path `/dashboard?scope={PAN_INDIA|ZONE|PROJECT}`. See `dashboards.md` for the layouts. UI shell: scope selector + filter bar + grid of widgets. Each widget renders via the dashboard renderer based on `widget.type`.

Export button top-right.

### Archetype 5 — List/Index

Used by Users list, Audit Log list, Form Definitions list. Sortable, filterable, paginated Ant Design Table with `size="small"`. Top-right: action buttons (e.g., "+ New User"). Click row → detail screen for that entity.

### Archetype 6 — Admin Editor

Two variants in v1: Form Definition Editor and User Management. Dashboard Definition Editor is Phase 2.

**Form Definition Editor (`/admin/forms/{id}/edit`):**

Two-pane layout:

- Left: JSON Schema editor — Monaco editor (with JSON schema validation), plus a visual mode toggle that shows field cards with add/remove.
- Right: live RJSF preview that re-renders on every change (debounced 300ms).

Top toolbar: code + version label, "Save Draft" button, "Publish" button (with confirmation modal), diff classifier output ("Backwards-compatible" or "Breaking — migration required"), "Affected Records: 47" count.

**User Management (`/admin/users`):**

List view, create/edit drawer slide-in. Edit form fields: name, email, designation, primary zone, primary division, active toggle, cross-zone assignments (multi-select), ad-hoc permissions (multi-select).

### Archetype 7 — Wizard

Multi-step flow. Used by Project Creation (`/projects/new`) and (Phase 2) Form Definition Creation.

Ant Design Steps component for navigation, prev/next buttons in footer, step validation before advancing.

**Project Creation steps (decision VVV — creates empty shell, no activities):**

1. Identity: project_code, name, project_type, zone, division, target_completion_year.
2. Scope: chainage (from/to), length_km, brief description, estimated villages count.
3. Documents: sanction order PDF, board minutes PDF, scope document PDF. Optional but recommended.

Final "Review and Submit" page with all values. Submit creates the project in `DRAFT` state and immediately transitions to `AWAITING_CAO_ALLOCATION`. CAO/C of the chosen zone gets a notification.

### Archetype 8 — Print View

Path `/print/project-summary/{project_id}` (and Phase 3: `/print/record/{id}`, `/print/dashboard/{type}`).

Hidden in the menu; reachable from "Print" action on project detail. Opens in a new tab so the user can Cmd/Ctrl+P → Save as PDF.

**Project summary print layout (v1):**

- Page 1 (cover): project code, name, zone, division, type, chainage, length, days since RB, lifecycle state, target year, overall progress, signature line, generation timestamp.
- Pages 2+: one section per activity. Each section: activity name, status, summary KPIs, records table (truncated to fit; "and N more" if necessary).
- Final page: open issues list (SLA breaches, sent-back items, pending approvals).

CSS uses `@page { size: A4; margin: 18mm 14mm; }`. Page breaks via `.page-break-before` utility class. Headers/footers repeat via `position: running()` or printed-paginated-divs.

---

## 4. Picker behavior

Pickers come up everywhere — assignment, drawing approvers, @mentions, activity creation. All go through `frontend/src/components/UserPicker.tsx` configured with a `context` prop matching one of the rows in `permissions.md` § 5.

**Visual:** Ant Design Select with custom render. Search box at top (typeahead with 300ms debounce). Each option shows name + designation short label + division. Grouped by designation where there are many options.

**Empty state:** "No users in {zone} match {filter}. Try expanding cross-zone or contact admin." with a link to the cross-zone request flow (Phase 3 — for v1, the message just suggests contacting admin).

**Single vs multi-select:** picker takes a `mode` prop. Multi-select shows tags inside the input; single-select shows the chosen item.

**Loading:** skeleton rows. Server-side fetch via TanStack Query, key includes the context discriminator and filter.

---

## 5. Notification UI

**Bell icon in top bar:** unread badge count. Click opens dropdown:

- Latest 10 notifications, each: type icon, title, body excerpt, "{time ago}", read/unread visual differentiator.
- Click a notification → marks read, navigates to the linked entity (record, project, etc.).
- "View all" link at bottom → `/notifications` full-page list.

**Notifications full page (`/notifications`):** sortable, filterable list of all notifications for the user. Filters by type, by read/unread, by date range. Mark-all-as-read button.

**Polling:** the badge count refreshes every 30 seconds via TanStack Query polling. WebSocket push deferred to Phase 3.

---

## 6. Empty states, loading states, errors

**Empty states** use Ant Design `Empty` component, customized with:

- No projects in tree: illustration + "No projects match your filters. Try adjusting them or [Clear Filters]."
- No records in activity: illustration + "No records yet. Add the first one." + button if user has permission.
- No activities in project: "This project has no activities yet. Add the first activity to get started." + button.
- Empty inbox: handled above (§ 3 archetype 1).

**Loading states:**

- Skeleton loaders (Ant Design `Skeleton`) during data fetch on every page that loads server data.
- Inline spinners only for sub-second waits.
- Full-page spinner only on initial app load while the auth context resolves.

**Error states:**

- Toast notifications (Ant Design `message.error`) for transient errors (save failed, network blip).
- Inline form errors for validation failures (RJSF handles this natively for JSON Schema; custom validators contribute via `formContext.errors`).
- Full-page error screen for unexpected errors (uncaught exceptions in routes), with Reload and "Report issue" buttons. Includes the request `traceId` for support.

**Confirmation patterns:**

- Soft delete: modal with reason text field (optional but encouraged).
- Workflow Submit / Verify: inline popover confirmation (Ant Design `Popconfirm`).
- Authenticate: full modal — this is significant.
- Send Back: full modal with required comment.
- Publish form version: modal showing diff classifier output.

---

## 7. Accessibility implementation

Target: WCAG 2.1 Level AA.

**Keyboard navigation:**

- Tab order follows DOM order. No `tabIndex > 0`.
- All actions reachable via keyboard. Modals trap focus.
- Esc dismisses modals, drawers, popovers.
- Enter activates the focused button. Space toggles checkboxes.

**Screen reader:**

- All interactive elements have accessible names (button text, aria-label, or aria-labelledby).
- Tree nodes use `role="treeitem"` with `aria-expanded`, `aria-selected`, `aria-level`.
- Tables use proper `<th scope>` for headers.
- Form fields linked to their labels by `htmlFor` / `id`.
- Live regions for async updates (toast, autosave indicator) via `aria-live="polite"`.

**Color and contrast:**

- All text meets AA contrast (4.5:1 for normal, 3:1 for large).
- Status indicators never rely on color alone — every red/amber/green badge has an accompanying icon.
- Focus indicators visible (Ant Design provides outlines; CSS forbids `:focus { outline: none }` without alternative).

**Testing:**

- axe-core integrated into Playwright tests; build fails on new violations.
- Manual keyboard-only navigation pass per archetype before phase acceptance.

---

## 8. Internationalization

i18next set up from day one with English-only files. Namespaces under `frontend/src/i18n/{lang}/`:

- `common.json` — buttons, generic words, status labels
- `nav.json` — sidebar, top bar
- `projects.json` — project-related strings
- `forms.json` — form labels (per-activity form titles, common section names; specific field labels often come from the form_definition itself)
- `dashboards.json`
- `errors.json`

All user-facing strings flow through `t('key')`. CI lints inline strings (`"text"` in JSX) above a length threshold to catch missed translations. Adding Hindi is creating `hi/*.json` files — no code changes.

---

## 9. Browser support, resolution, performance

**Browsers:** Chrome and Edge, last two stable versions. Officially tested in CI. Firefox/Safari should work but not validated.

**Resolution:** minimum 1366×768. Below that, the layout shows a "PIA Tracker is optimized for desktop" message. Vertical-left tabs on Record Edit specifically chosen to fit 1366 width.

**Performance budgets (architecture § 14):**

- FCP < 1.5s, TTI < 3s.
- Tree expand/load < 200ms.
- Form save < 500ms.
- Code-split routes via Vite's dynamic imports; vendor bundle separate.

---

## 10. Component conventions

- One component per file, named export matching filename.
- Hooks in `src/hooks/`, components in `src/components/{Domain}/`, pages in `src/pages/`.
- Server state via TanStack Query — never `useEffect + fetch`.
- Local UI state via `useState`/`useReducer`. Global UI state (theme, sidebar collapsed, selected user for dummy auth) via Zustand stores.
- All Ant Design components imported from `'antd'`, custom styling via the `theme.token` rather than CSS overrides.
- Form rendering: RJSF for dynamic forms; manual react-hook-form for static admin forms (User edit, etc.).
- All user-facing strings via `t('key')` — never inline.
- All dates rendered via a `<DateDisplay>` component that handles UTC→IST conversion and the "5 days ago" relative format.
- All money via `<CurrencyDisplay>`, all hectares via `<HectaresDisplay>`.
