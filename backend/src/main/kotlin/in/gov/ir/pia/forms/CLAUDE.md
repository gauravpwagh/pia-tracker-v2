# backend/forms — Form definitions, validation, schema diff

This package owns the schema-as-data form pattern (docs/architecture.md § 4.1, docs/forms.md).

## Components

- `FormDefinitionService` — CRUD on `form_definitions`, version management.
- `SchemaValidator` — wraps networknt validator. Validates `data_json` against a form_definition's schema.
- `SchemaDiffClassifier` — compares two JSON Schema versions; returns `BackwardsCompatible` or `Breaking(reasons)`.
- `FormValidator` interface — implemented per activity for cross-field business rules (e.g., `LandAcquisitionValidator`). Auto-discovered via Spring DI.
- `JsonbMigrationRunner` — runs Kotlin migration classes in `db/jsonb-migration/` lazily on read of records on outdated schema versions.

## Rules

- **Validation order**: JSON Schema first, then cross-field validators, then DB write. Each layer can short-circuit.
- **Form fields are added via Flyway data migrations**, never via Kotlin classes. The form_definition row is the source of truth.
- **Breaking schema changes** ship with a Kotlin migration class. The diff classifier flags this in CI.
- **Frontend validation is best-effort UX.** Server-side validation is always authoritative.

## When you're touching this

Re-read `docs/forms.md`. Especially § 6 (versioning rules) and § 8 (cross-field validators).
