# Frontend — React + TypeScript + Vite SPA

You're in the frontend module. Read `/CLAUDE.md` at the repo root first, then this file.

---

## Stack

- React 18 (function components + hooks only).
- TypeScript ~5.5, strict mode.
- Vite 5 as the bundler and dev server.
- Ant Design 5.x for components, themed via `src/theme/tokens.ts`.
- React Router v6 for routing.
- TanStack Query for server state, TanStack Table for tabular UIs.
- `@rjsf/core` for dynamic forms (record edit pages).
- ECharts for visualizations.
- i18next for localization (English-only at v1; structure ready for Hindi).
- DOMPurify for sanitizing user markdown.
- Zustand for global UI state (theme, sidebar collapsed, dummy-auth user).
- React Hook Form for static admin forms.
- Playwright for E2E tests; Vitest for unit + component.
- Generated API client (`openapi-typescript-codegen`) from the backend's OpenAPI spec.

---

## Folder layout

```
frontend/
  package.json
  tsconfig.json
  vite.config.ts
  index.html
  public/
    logo.svg
    logo-dark.svg
    favicon.svg
  src/
    main.tsx                 # entry; mounts ConfigProvider + Router
    App.tsx                  # top-level routes
    components/              # shared components (Sidebar, TopBar, UserPicker, DateDisplay)
    pages/                   # one per archetype (Inbox, Projects, RecordEdit, Dashboard, Admin)
    hooks/                   # custom hooks (useUserPicker, useDashboardData)
    api/                     # TanStack Query keys, mutation helpers
    forms/                   # RJSF widgets + form-rendering helpers
    workflow/                # workflow action buttons + state badges
    theme/
      tokens.ts              # color palette, typography, spacing tokens
      print.css              # print stylesheet
    i18n/
      i18n.ts                # i18next setup
      en/
        common.json
        nav.json
        projects.json
        forms.json
        dashboards.json
        errors.json
    lib/
      auth.ts                # dummy-auth helpers + cookie management
      etag.ts                # ETag carry-around helper
      idempotency.ts         # idempotency-key generation
      formatters.ts          # date, currency, hectares
    stores/                  # zustand stores
    generated/               # OpenAPI client (gitignored; generated)
  tests/
    e2e/                     # Playwright
    fixtures/                # test data
```

---

## Conventions

- **One component per file**, named export matching filename, default export for routed pages.
- **Hooks** colocated with the component if single-use; in `src/hooks/` if shared.
- **Server state** via TanStack Query. **Never** `useEffect + fetch`. Mutations via `useMutation`.
- **Local UI state** via `useState` or `useReducer`.
- **Global UI state** (theme, sidebar collapse, dummy auth user) via Zustand stores.
- **Forms**: dynamic (record edit) → RJSF; static admin (User edit) → React Hook Form.
- **All user-facing strings** via `t('namespace.key')`. ESLint flags inline strings above a length threshold.
- **Dates** via `<DateDisplay value={iso}>`. **Money** via `<CurrencyDisplay>`. **Hectares** via `<HectaresDisplay>`. Don't format inline.
- **Tables** use `<Table size="small">` with `pagination={{ pageSize: 20 }}`. Sort + filter pushed to server, not client-side.
- **Ant Design imports** from `'antd'`, customized via `theme.token` not CSS overrides.
- **No `dangerouslySetInnerHTML`** (ESLint enforced). Markdown rendered via DOMPurify-cleaned HTML in a single shared component.

## ETag and idempotency

- Every entity loaded via TanStack Query records its ETag in the query cache metadata.
- Mutations look up the cached ETag and include `If-Match` automatically via the API helper wrapper.
- Action endpoints get an `Idempotency-Key` (UUID v4) generated client-side; retries on network error reuse the key.

## Themes

- Two themes ship at v1 (light + dark). Algorithm chosen from a Zustand store. `prefers-color-scheme` for first visit, user override persisted to `localStorage`.
- Theme tokens are the source of truth; CSS overrides are not allowed.

## Routing

URL is the source of truth for selection in the Tree Master-Detail archetype:

- `/projects` — tree at root.
- `/projects/{projectCode}` — project selected; detail pane open.
- `/projects/{projectCode}/activities/{activityId}` — activity selected.
- `/records/{recordId}/edit` — record edit page.
- `/inbox`, `/dashboard?scope=ZONE&zoneId=X`, `/admin/users`, etc.

## When you're editing here

Re-read `docs/ui.md`. The archetypes there are not suggestions — they're the design contract.
