# backend/domain — Entities and domain types

JPA-mapped entities, value objects, enums, and pure-Kotlin domain types.

## Rules

- **Entities have `@Entity`, identity by `id` (UUID), and `@Version` for optimistic locking.**
- **No business logic in entities** beyond simple invariants enforceable in constructors. Behavior lives in services.
- **Soft-delete columns** (`is_deleted`, `deleted_at`, `deleted_by_user_id`) on every domain entity; filtering via Hibernate `@SQLRestriction("is_deleted = false")` is the default.
- **JSONB fields** mapped as `JsonNode` (Jackson) using `@JdbcTypeCode(SqlTypes.JSON)`. Never try to map JSONB content as nested entities.
- **No bidirectional associations** unless you genuinely need them. Bidirectional implies cascade complexity we don't want.
- **No cascade attributes** on associations. Save children explicitly.
- **Equality and hashCode by `id`.** Use `data class` only for value objects, never for entities — entities need stable hashCode.

## Naming

`{Entity}.kt` — singular noun, PascalCase. Embedded value objects in the same file.

## Where to put what

- An entity → `domain/{module}/{Entity}.kt`. Modules align with bounded contexts (project, activity, workflow, drawing, comment, attachment, audit, user).
- A pure value object → same module folder.
- A domain service (transactional orchestration) → `service/{module}/`, not here.
