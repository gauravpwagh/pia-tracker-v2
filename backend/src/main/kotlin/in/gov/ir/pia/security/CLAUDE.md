# backend/security — Authentication, Principal, PermissionEvaluator

This package owns:

- `PiaAuthenticationProvider` (dummy at v1, Keycloak in Phase 3) — builds the `Principal` from auth context.
- `Principal` interface and impl — the single carrier of identity. See `docs/permissions.md` § 9.
- `PermissionEvaluator` bean — resolves `@PreAuthorize` calls via the scope-implication rules in `docs/permissions.md` § 4.
- `RoleMembershipResolver` — internal-only; computes a user's effective permissions from designation default roles, ad-hoc role memberships, and ad-hoc permission grants.
- `SecurityConfig` — Spring Security filter chain, CSRF, session management.

## Rules

- Permission checks happen through `PermissionEvaluator` only. No inline role checks (`if (principal.role == X)`) — CI lints for this.
- Building a `Principal` is a once-per-request, cache-on-request operation. Don't rebuild inside services.
- Dummy auth code paths are gated by `@Profile("!prod")`. CI confirms the prod profile rejects them.
- Permission codes referenced in `@PreAuthorize` must exist in the `permissions` table. A startup check validates this and fails to boot if any are missing.

## When you're editing here

Re-read `docs/permissions.md` and `docs/security.md` first. Changes in this package have outsized blast radius.
