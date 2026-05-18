# frontend/src/i18n — Localization

i18next setup; English-only at v1. Adding a new language is creating `hi/*.json` (or whichever locale) files and registering them in `i18n.ts`. No code changes elsewhere.

## Conventions

- Namespaces match this folder structure: `common`, `nav`, `projects`, `forms`, `dashboards`, `errors`. Add a namespace only when an existing one would balloon.
- Keys are dot-separated and namespaced by feature.
- All user-facing strings flow through `t('namespace.key')`. ESLint flags inline strings over a threshold.
- Form-field labels typically come from `form_definitions.schema_json.title` / `ui_schema_json.ui:title` — not from these files. These files cover application chrome (nav, actions, errors), not the form contents.

## When you're touching this

If you add a key to one language file, add it (with the same key path) to every other language file with the placeholder `[TODO: translate]`. Missing keys in non-English files fall back to English at runtime, but tracking the TODOs makes them visible.
