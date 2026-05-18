# frontend/src/components — Shared components

Components used across multiple pages live here. Page-specific components (only used by one page) live under that page's folder in `src/pages/`.

## Folder layout

```
components/
  shell/          # TopBar, Sidebar — the persistent chrome
  pickers/        # UserPicker (with the context discriminator), and other typeaheads
  display/        # DateDisplay, CurrencyDisplay, HectaresDisplay, StateBadge
  layout/         # Common layout helpers (PageHeader, ActionBar)
  workflow/       # WorkflowActionButtons, WorkflowHistoryList, WorkflowStateBadge
  comments/       # CommentList, CommentComposer (markdown + @mention typeahead)
  tree/           # Tree component used in the Tree Master-Detail archetype
  forms/          # Generic form helpers — RJSF custom widgets live in src/forms/
```

## Conventions

- One component per file, named export matching filename, no default exports here (default exports reserved for routed pages).
- Props typed via interface, never `any`.
- Internal state via hooks; no class components.
- Forms that take user input here MUST sanitize via DOMPurify when displaying any markdown; ESLint flags `dangerouslySetInnerHTML`.
- Components do NOT call APIs directly. They take data via props and emit events via callbacks. The page or hook owns the data fetching.

## When you're touching this

A shared component is a contract. Changing its API breaks every page using it. Consider whether the change should be a new variant or a prop addition, not a breaking change.
