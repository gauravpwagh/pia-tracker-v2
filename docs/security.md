# PIA Tracker — Security

**Status:** Draft v1.
**See also:** `architecture.md` § 9 (security architecture); `permissions.md` § 8 (security events); `api.md` § 7 (rate limits).

This document specifies the threat model, the catalog of security controls, the audit log integrity model, and the incident response runbook outline.

---

## 1. Threat model (STRIDE)

A pragmatic STRIDE pass over the application surfaces.

### Spoofing

- **Impersonation by stolen credentials.** Mitigation v1: short-lived JWT sessions (15 min idle, 8 hour max); credentials never logged. Phase 3: real auth via Keycloak with MFA required for ADMIN and SUPER_ADMIN.
- **Dummy-auth abuse in beta.** The role picker in dev/beta gives total impersonation. Mitigation: dummy auth is disabled in the `prod` Spring profile; CI blocks any build where `pia.auth.mode != "real"` for prod artifacts. Beta deployment carries a banner "BETA — credentials are not real" on every page.
- **Session token leak in URL.** Mitigation: tokens only in HttpOnly cookies or Authorization headers; never in URL params. The token replay window is short.

### Tampering

- **Direct database write.** Mitigation: app uses a least-privileged DB role (`pia_app`) with INSERT/UPDATE/DELETE only on domain tables; `audit_log` has INSERT only (no UPDATE/DELETE — enforced by trigger, § 3 below). Schema migrations run as a separate `pia_migrator` role temporarily granted by ops.
- **JSONB manipulation.** Mitigation: every JSONB read validates against the corresponding form_definition schema at output time; tampered fields detected as schema violations.
- **Tampered attachments.** Mitigation: every attachment has a server-computed SHA-256 stored alongside; on download, the hash is recomputed and compared. Mismatch triggers a SECURITY_EVENT and 503 to the client.
- **Tampered audit log.** Mitigation: hash chain (§ 3). Monthly integrity check.

### Repudiation

- **"I didn't authenticate that record."** Mitigation: every state transition records the actor, timestamp, IP, user-agent, and traceId in `audit_log`. The audit row is immutable. CE/Cs authenticating records sign off explicitly with a confirmation modal.
- **"I didn't grant that permission."** Mitigation: PERMISSION_GRANT events are logged as SECURITY_EVENT; the granting user, target user, permission code, and reason are all captured.

### Information disclosure

- **Unauthorized read of project data.** Mitigation: query-level permission filter (`permissions.md` § 4) — every list endpoint AND every list query applies the user's accessible-zone filter. Detail endpoint additionally enforces. No "200 OK with empty list, 403 on detail" inconsistency.
- **Attachment URL guessing.** Mitigation: signed download URLs valid for 5 minutes only. Permission check on signing, hash check on download.
- **JWT side-channel leak via logs.** Mitigation: HTTP logging filters strip `Authorization` and `Cookie` headers. CI grep test ensures no log statement contains `request.getHeader` of auth headers.
- **Stack trace disclosure.** Mitigation: the production profile sets `server.error.include-message: never`. Internal `traceId` is returned to clients; the actual error context is in server logs only.
- **PII in URL or query string.** Mitigation: server logs strip query strings on auth endpoints. Frontend never puts emails or PAN numbers in URLs.

### Denial of service

- **Brute-force on auth.** Mitigation: rate limit 5/min/IP on auth endpoints. Phase 3: account lockout after 10 failures in 15 min.
- **Slowloris / large request body.** Mitigation: Nginx and Spring both cap request body at 100 MB (covers the largest legitimate attachment + form data); idle connection timeout 60s; client header timeout 10s.
- **Expensive queries via API abuse.** Mitigation: page size capped at 200, sort fields allowlisted per endpoint. Bulk transition caps batch size at 100.
- **File upload flood.** Mitigation: per-user rate limit 30 attachment uploads / 10 min. ClamAV scan is blocking, naturally throttling.
- **Resource exhaustion via deeply nested JSON.** Mitigation: JSON parser configured with max depth 32, max string length 1 MB; oversized inputs rejected with 400.

### Elevation of privilege

- **Modifying own permissions.** Mitigation: `PERMISSION.GRANT` requires SUPER_ADMIN; a user cannot grant themselves any permission. The user's own ID is checked against the target ID; same → 403 with explicit reason.
- **Role membership tampering.** Mitigation: `ROLE.MANAGE` is also SUPER_ADMIN-only. Audit logged.
- **SQL injection.** Mitigation: parameterized queries everywhere (Hibernate + jOOQ; no string concatenation for user input). CI lint: any code using `Statement.execute(rawSql)` is flagged.
- **JSON Schema bypass.** Mitigation: server-side validation is always authoritative; frontend validation is for UX only. Every POST/PATCH on activity_records re-validates the full data_json server-side regardless of what the client sent.
- **IDOR (insecure direct object reference).** Mitigation: every endpoint that takes an entity ID resolves the entity through a service that enforces permission on read. Specifically: `service.findByIdOrThrow(id, principal)` is the only entry point.

---

## 2. Control catalog

### Authentication and session

- v1: dummy authentication for development and beta; the user picks a seeded user.
- Phase 3: Keycloak OIDC integration; users authenticate against Railway SSO; sessions are JWT-bearer with refresh tokens.
- Session storage: HttpOnly, Secure, SameSite=Lax cookies. JWT not in localStorage.
- Idle timeout: 15 min. Absolute timeout: 8 hours.
- Logout invalidates the session server-side (a Redis blocklist for revoked JWTs in Phase 3).

### Authorization

- Centralized `PermissionEvaluator` with the scope-implication rules in `permissions.md` § 4.
- `@PreAuthorize` on every controller method.
- Query-level filter in repositories: all list queries apply `(zone in :accessibleZones OR :isSuperAdmin)`.
- No inline `principal.role.contains(...)` checks anywhere (CI-enforced via Detekt custom rule).

### Transport

- TLS 1.3 for all external traffic. Nginx is the TLS terminator.
- v1: mkcert-issued local CA in dev and beta. The Railway-network CA cert is bundled in beta browsers.
- Production: certificates issued by the Railway production CA.
- Internal service-to-service in the docker-compose network: plain HTTP within the network; the network itself is isolated.

### Data at rest

- v1: filesystem-level encryption via the host OS (LUKS on Linux). Postgres and MinIO data directories reside on an encrypted volume.
- Phase 3: column-level encryption for selected sensitive fields (e.g., applicant Aadhaar in JMR data — if/when required by Railway data policy).
- Backups (see § 9) are encrypted at rest with a separate key from operational data.

### Input validation

- JSON Schema for record data (server-side, networknt validator).
- Kotlin validators for cross-field business rules.
- Bean Validation (Jakarta) for top-level request DTOs.
- Defense in depth: the database has CHECK constraints for size, range, enum (see `database.md` § 1 conventions).

### Output encoding

- All HTML output is React-rendered (auto-escaping). Inline `dangerouslySetInnerHTML` is forbidden by ESLint custom rule.
- Markdown comments are rendered with DOMPurify on the frontend before display. The whitelist allows: `p, br, strong, em, ul, ol, li, blockquote, code, pre, a` (with `rel="noopener noreferrer"` enforced).
- Excel exports: cells with leading `=`, `+`, `-`, `@` are prefixed with a single quote to neutralize formula injection.
- PDF print: content rendered via the same React templates; no user-supplied HTML executes.

### Headers

Nginx sets on all responses:

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Strict-Transport-Security: max-age=31536000; includeSubDomains
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

CSP `'unsafe-inline'` for styles is required by Ant Design's runtime CSS-in-JS; Phase 2 work explores tightening it.

### Cookies

`HttpOnly; Secure; SameSite=Lax; Path=/`. The dummy-auth cookie at v1 follows the same template but is signed only — when real auth lands, it carries the JWT.

CSRF protection: SameSite=Lax handles the bulk; for state-changing POSTs, Spring Security's CSRF token is also required (issued via a `XSRF-TOKEN` cookie, returned via `X-XSRF-TOKEN` header). Pure-API clients exempt via per-token allowlist.

### File upload

- Allowed MIME types: PDF only at v1. Whitelist-checked (not blacklisted).
- Max size: 48 MB (decision MMM). Enforced at Nginx, Spring, and MinIO.
- Filenames sanitized — no path separators, no leading dots, max 255 chars.
- ClamAV scan blocking before commit. Infected files are quarantined to a separate MinIO bucket (`pia-quarantine`) and a SECURITY_EVENT is logged.
- The MinIO object key is server-generated UUID, not the user-supplied filename. Original filename is stored in the `attachments` table for display.

### Logging and monitoring

- Application logs: structured JSON, shipped to Loki via promtail. Retention 90 days online, 1 year archived.
- Access logs: Nginx logs to stdout, shipped to Loki. Same retention.
- Sensitive log fields scrubbed at write time: passwords (never logged), Authorization headers, Cookies, full request bodies on auth endpoints.
- Metrics (Prometheus): request rates, response codes by endpoint, p50/p95/p99 latency, DB connection pool usage, MinIO operation rates, ClamAV scan latency.
- Alerts (Phase 2 — Grafana alerting): 5xx rate > 1% for 5 min, p95 latency > 2s for 5 min, audit log integrity check failure (any), ClamAV down for > 1 min.

### Secrets management

- v1: environment variables loaded by Docker Compose from a `.env` file outside the repo. The `.env.example` in the repo shows the variables.
- Database password, MinIO root credentials, JWT signing key, ClamAV connection are environment variables.
- Phase 2: Vault integration; secrets fetched at startup via short-lived tokens.
- No secret is ever logged. CI grep for likely secret patterns (`password=`, `Bearer eyJ`, MinIO keys) in test logs and source code.

### Backup encryption

- pg_dump output and MinIO snapshot encrypted with GPG using a separate key, stored offline.
- See deployment.md § 6 for the full backup procedure.

---

## 3. Audit log integrity (hash chain)

The `audit_log` table (database.md § 9) carries `prev_hash` and `row_hash` for tamper-evidence:

- On insert, the trigger computes `row_hash = sha256(prev_hash || at_iso || actor_user_id || action || entity_type || entity_id || before_json || after_json)`.
- `prev_hash` = the `row_hash` of the chronologically previous row in the same partition.
- The first row of each partition uses the last `row_hash` of the previous partition as its `prev_hash`.

**Integrity check job (`AuditIntegrityJob`):**

- Runs daily at 02:00.
- For each partition, replays the hash chain and confirms every `row_hash` matches the recomputed value.
- Mismatch → emergency alert + SECURITY_EVENT row inserted.

**Append-only enforcement:**

The triggers in database.md § 9 raise an exception on any UPDATE or DELETE. Direct database admin work that needs to modify audit_log must drop the triggers, perform the change, restore the triggers — every such intervention is itself logged as a SECURITY_EVENT.

---

## 4. Vulnerabilities in dependencies

- **SCA in CI**: Dependabot for npm and Gradle. Critical findings fail the build.
- **Container image scanning**: Trivy on every Docker image build. Critical + high findings fail.
- **Lock files committed**: `package-lock.json` (or `pnpm-lock.yaml`) and Gradle's `dependency-lock`. Reproducible builds.
- **Update cadence**: monthly minor-version sweep; critical CVEs patched within 7 days.

Acceptable risks:

- Some Indian-Railway-network-specific dependencies (if any) may lag in updates. Phase 3 doc per-dependency exception.

---

## 5. Security testing

- **SAST**: Detekt for Kotlin, ESLint with security plugins for TypeScript.
- **DAST**: OWASP ZAP baseline scan against beta deploy in CI (Phase 2).
- **Dependency scanning**: § 4 above.
- **Pentest**: external pentest scheduled before Phase 3 production release.
- **Threat-model review**: quarterly, revisits assumptions; updates this document.

Specific scenarios in the test suite:

- IDOR: every endpoint with an entity ID has a test confirming a user from another zone gets 404 (not 200, not 403 — 404 to avoid revealing existence).
- Permission bypass: every action endpoint has a test confirming the wrong role gets 403.
- ETag stale: every PATCH endpoint has a test sending an old ETag, expecting 409.
- File upload: tests for path traversal in filename, oversize files, wrong MIME type, infected file (via EICAR test signature).
- Markdown XSS: tests for `<script>`, `javascript:` href, `<iframe>`, etc., expecting them stripped.

---

## 6. Incident response

Incidents are classified into severity:

- **S0**: data exfiltration confirmed, integrity breach, production outage > 1 hour.
- **S1**: integrity check failure, suspected unauthorized access, partial production outage, ClamAV bypass detected.
- **S2**: targeted phishing successful, single-user account compromise, dependency CVE.
- **S3**: failed pentest finding (low/medium), unusual access pattern.

For each, the runbook in `ops/runbooks/incident-{level}.md` (skeleton in v1) covers:

1. Detection signal and triage.
2. Containment steps (lock affected accounts, revoke tokens, isolate node).
3. Forensic preservation (snapshot audit_log partition, capture filesystem state).
4. Communication plan (Railway IT, app owner, affected users where appropriate).
5. Recovery steps.
6. Post-incident review template.

The runbooks are skeletons in v1; full content develops with production experience.

---

## 7. Data classification

- **Public**: zone/division names, designation labels, application metadata. No restriction.
- **Internal**: project codes, names, chainages, summary aggregate data. All authenticated users in scope.
- **Restricted**: per-record details (village data, drawing PDFs, comments). Role+scope gated.
- **Confidential**: audit log details, user PII (email, employee ID), security events. SUPER_ADMIN / ADMIN only.

Backups and exports inherit the highest classification of their contents.

---

## 8. Compliance and regulatory

- The application processes data on Indian Railways infrastructure. Subject to Railway Board IT policy and any applicable government data regulations.
- Personal data handled is minimal: names, employee IDs, email addresses of Railway employees. No public-facing PII.
- Data residency: all data, backups, and DR copies remain within India.
- Retention: domain data retained indefinitely while the project is active and for 10 years after `lifecycle_state = COMPLETED` / `DROPPED`. Audit log retained for 7 years. After retention, data is archived to cold storage and offline-encrypted; deletion only on explicit Railway Board directive.

---

## 9. The "what if a SUPER_ADMIN goes rogue" scenario

A pragmatic note: the centralized permission model means SUPER_ADMIN can do anything. Mitigations:

- Production SUPER_ADMIN accounts limited to two named individuals.
- Every SUPER_ADMIN action is a SECURITY_EVENT. The audit log is reviewed weekly during pilot, monthly thereafter.
- Audit log integrity check (§ 3) detects retroactive log tampering.
- Backups exist outside the application's reach (offline storage) so total destruction is recoverable.
- Phase 3 introduces an "approval required" workflow for the most sensitive actions (e.g., bulk permission grants, mass data exports) — two SUPER_ADMINs required for the action to execute.
