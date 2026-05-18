# backend/api — REST controllers

One file per resource. Controllers are thin: validate the request shape (Bean Validation handles most), delegate to a service, map exceptions via the global `ApiExceptionHandler`.

## Rules

- **No business logic.** If you find yourself writing more than ~10 lines in a controller method, lift to a service.
- **No `@Transactional`** on controllers. Transactions belong to services.
- **Every method has `@PreAuthorize`.** Not optional. CI fails if a controller method lacks it.
- **Every method has `@Operation`** (springdoc-openapi) with summary, description, and `@ApiResponse` entries for documented status codes.
- **Action endpoints** (state transitions) are POSTs to `/api/v1/resource/{id}/action-name` and require `If-Match`. Idempotency key respected.
- **Error envelope** comes from `ApiExceptionHandler`; never write `ResponseEntity.badRequest().body(...)` inline.
- **Pagination params** follow Spring Data conventions: `page`, `size`, `sort=field,direction`.

## Endpoint catalog

See `docs/api.md` § 6 for the full v1 list. Add new endpoints there before implementing.

## Naming

`{Resource}Controller.kt`. Methods named after the action verb: `list`, `get`, `create`, `update`, `delete`, plus action verbs (`submit`, `verify`, `authenticate`, `sendBack`).
