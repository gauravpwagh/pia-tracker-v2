# Backend — Spring Boot service

You're in the backend module. Read `/CLAUDE.md` at the repo root first if you haven't already, then this file, then any per-folder `CLAUDE.md` you encounter.

---

## Stack

- Kotlin 1.9+, JDK 21, Spring Boot 3.4.
- Spring Data JPA + Hibernate 6 for the domain model.
- Hibernate's `@JdbcTypeCode(SqlTypes.JSON)` for JSONB columns.
- jOOQ for complex queries (dashboards, dynamic filters).
- Flyway for schema and data migrations.
- springdoc-openapi for OpenAPI generation.
- networknt json-schema-validator for record validation.
- Apache POI for Excel exports.
- Bucket4j for rate limits.
- MinIO Java client for attachments.
- Build via Gradle Kotlin DSL.

---

## Folder layout

```
backend/
  build.gradle.kts
  settings.gradle.kts
  src/main/kotlin/in/gov/ir/pia/
    PiaApplication.kt          # @SpringBootApplication entry
    config/                    # Spring Beans, Jackson, OpenAPI, MinIO, Flyway
    security/                  # Principal, PermissionEvaluator, dummy + real auth
    api/                       # REST controllers (one per resource)
    domain/                    # Entities, value objects, domain services
    repository/                # JPA repositories + jOOQ-using query classes
    service/                   # Application services (orchestrate domain + persistence)
    forms/                     # FormDefinitionService, SchemaDiffClassifier, validators
    workflow/                  # WorkflowService, WorkflowEngine, drawings DrawingService
    dashboard/                 # SummaryUpdater, dashboard query layer
    audit/                     # AuditLogService, hash chain, integrity job
    attachment/                # MinIO + ClamAV integration
    notification/              # Notification model + bell-badge endpoints
    export/                    # POI-based Excel export
  src/main/resources/
    application.yml            # base config
    application-dev.yml        # dev overrides
    application-beta.yml       # beta overrides
    application-prod.yml       # production overrides
    db/migration/              # Flyway schema migrations (V001__, V002__...)
    db/data/                   # Flyway data migrations (V001_001__...)
    db/jsonb-migration/        # Kotlin classes for breaking schema_json migrations
  src/test/kotlin/in/gov/ir/pia/
    seed/                      # Test data seeder
    {package}Test.kt           # Unit tests
    {Feature}IntegrationTest.kt # Testcontainers-based
```

---

## Conventions

### Package structure

- One package per bounded context. Avoid cross-package implementation imports — use the public API of the other package.
- `controller`/`service`/`repository` layers within a package, not as top-level packages.

### Layer rules

- **Controllers** are thin. Validate request shape, delegate to a service, map exceptions. No business logic. No transactions.
- **Services** orchestrate. They own `@Transactional`. They emit domain events. They invoke validators.
- **Repositories** are read/write only. No business decisions. JPA repositories for simple CRUD; jOOQ-using `QueryService` classes for complex reads.
- **Domain entities** are JPA-mapped. Equality by `id`. Avoid bidirectional associations unless you need them.

### Transactions

- Read-only endpoints: `@Transactional(readOnly = true)` on the service method.
- Write endpoints: `@Transactional` on the service method.
- Don't open transactions in controllers.
- Domain events fired via `ApplicationEventPublisher` inside the transaction run their listeners in the same transaction (Spring default), so summary updates roll back with the originating write.

### JSONB

- Map JSONB columns as `JsonNode` (Jackson) via Hibernate's `@JdbcTypeCode(SqlTypes.JSON)`.
- Don't try to map JSONB content as nested entities — keep it opaque on the entity side; service-layer Kotlin types interpret it.
- Validate against the form definition's JSON Schema before write.

### Permissions

- Every controller method has a `@PreAuthorize` annotation.
- The annotation uses `@permissionEvaluator.hasPermission(...)` — never inline role checks.
- Repositories that load by ID apply the permission check via service-layer wrappers, not in the controller.
- Query-level filter: list-style repository methods take a `Principal` and append `WHERE zone_id IN :accessibleZones` (or skip if super admin).

### Tests

- Unit tests use MockK. Co-locate by package: `src/test/kotlin/in/gov/ir/pia/{package}/`.
- Integration tests with Testcontainers (real Postgres, real MinIO, ClamAV via EICAR for the scan tests).
- Property tests with jqwik for state-space exploration (workflow engine, schema diff classifier).
- See `docs/testing.md` for the full strategy.

### Migrations

- Schema changes are Flyway `V{NNN}__*.sql` files. Once merged, they are immutable — Lefthook enforces this.
- Data changes (seeds, form definitions, workflow definitions) are `V{NNN}_{NNN}__*.sql`.
- Breaking JSONB schema changes ship with a Kotlin migration class in `db/jsonb-migration/`. See `docs/forms.md` § 6.

### Avoid

- Hibernate cascade attributes (`cascade = ALL`) on associations — explicit save/delete is clearer.
- Lazy associations followed across a transaction boundary — fetch what you need in the query.
- `String` for IDs — always `UUID`.
- `Date` and `Calendar` — always `Instant`, `LocalDate`, `OffsetDateTime`.
- Hardcoded role/permission codes outside the seed migrations.
- Mutating `current_state_id` directly — go through `WorkflowService.transition()`.
- New permission codes without a Flyway data migration adding the row.
