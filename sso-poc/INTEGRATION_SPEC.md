# PIA Tracker — Cross-Site SSO Handoff Spec (JWT)

This is the contract the **partner system** ("ABCDE") implements so its already-logged-in
users can click a button and land in PIA Tracker already authenticated.

Trust model: **PIA never reads or trusts the partner's session cookies.** The partner
mints a short-lived, signed JWT and redirects to PIA. PIA trusts only the signature.

> This spec was originally drafted around an RS256 (asymmetric) design — see git history
> if you need it. The partner's actual stack only supports **HS256** (shared secret), so
> that is what's implemented. If the partner later adds claims (designation, zone, etc.),
> those can be added without breaking this contract — PIA only requires `sub`/`name`/`iat`/`exp` today.

---

## 1. Flow

```
User (logged into ABCDE)                  ABCDE server                PIA
─────────────────────────                 ──────────────             ───
click "Open in PIA Tracker"  ──GET──►  ABCDE mints HS256 JWT
             ◄──302 redirect── Location: http://<target-server>/ABCDE/tokenInfo.jsp?token=<JWT>
                                        (ABCDE's own URL shape; PIA's actual endpoint below)
browser follows redirect ───────────────────────────────────────►  GET /api/v1/sso/callback?token=<JWT>
                                                                    verify JWT signature + expiry
                                                                    find user by employee_id=sub
                                                                    start PIA session
             ◄──────────────────────── 302 → https://pia.local/ ───
```

Users must already be provisioned in PIA — see `scripts/import_users_abcde.py`. There is
no auto-provisioning from the token; an unrecognized `sub` gets a `403`.

## 2. JWT

**Claims (final, per ABCDE's integration doc):**

| Claim  | Req | Meaning                                                              |
|--------|-----|-----------------------------------------------------------------------|
| `sub`  | ✔   | Login ID. Joins to PIA `users.employee_id`.                          |
| `name` | ✔   | Display name. Informational only — PIA does **not** sync `users.name` from this claim; the CSV import is the source of truth. |
| `iat`  | ✔   | Issued-at (epoch seconds). Must be within ±60s of PIA's clock.        |
| `exp`  | ✔   | Expiry. **TTL = 10 minutes** per the ABCDE doc.                       |

No `iss`, `aud`, `jti`, `designation_code`, or `zone_code` — those fields are not sent.
Designation/zone/division are resolved once at import time and live in PIA's own `users`
table, not carried on every login.

**Signing:** HS256, shared secret between ABCDE and PIA (`pia.sso.secret` /
`PIA_SSO_SECRET` — never committed to the repo, exchanged out-of-band).

### Example claims
```json
{
  "sub": "110123456",
  "name": "John Smith",
  "iat": 1750000000,
  "exp": 1750000600
}
```

## 3. What PIA does with the token (`GET /api/v1/sso/callback`)

See `backend/src/main/kotlin/in/gov/ir/pia/security/SsoTokenVerifier.kt` and
`backend/src/main/kotlin/in/gov/ir/pia/api/SsoCallbackController.kt` — this is the
authoritative implementation; the steps below just summarize it.

1. Verify HS256 signature with the shared secret. Bad → `401 SIGNATURE_INVALID`.
2. Assert `exp` not passed and `iat` within skew. Fail → `401 EXPIRED` / `401 ISSUED_IN_FUTURE`.
3. Reject tokens whose lifetime (`exp - iat`) exceeds `pia.sso.max-token-lifetime-seconds`
   (600s, i.e. 10 minutes) → `401 LIFETIME_TOO_LONG`.
4. Reject replay: the token has no `jti`, so PIA hashes the raw token (SHA-256) and
   records it in `sso_used_token` on first use. A repeat → `401 REPLAY`. This guards
   against a captured redirect URL (browser history, server/proxy logs) being reused
   within the 10-minute window.
5. `user = users where employee_id = sub, active, not deleted`. Not found → `403 USER_NOT_FOUND`
   (no auto-provisioning).
6. Start PIA's own session and `302` to `/`.

Every rejection is logged with its reason code (never the raw token or the shared
secret) so a failed login can be diagnosed from the app logs alone.

## 4. Security requirements (non-negotiable)

- HTTPS only, both for ABCDE's redirect and PIA's callback.
- Shared secret exchanged securely, out-of-band — never in email/chat/repo.
- Clock sync (NTP) between ABCDE and PIA — `iat`/`exp` validation assumes it.
- `sub` must match `users.employee_id` **exactly** (case, leading zeros, whitespace) —
  verify this with a real round-trip before go-live, don't assume it.

## 5. Local testing without the real partner

`sso-poc/idp/` (Node/Express, `http://localhost:9099`) mints HS256 tokens matching the
claim set above, using the same default dev secret as `application-beta.yml`
(`PIA_SSO_SECRET`, override both sides together if you change it). Point its
`PIA_CALLBACK` env var at your running backend's `/api/v1/sso/callback` and click
through the mock login page.

## 6. Known gaps before real production traffic

- `SsoTokenVerifier`/`SsoCallbackController` are gated `@Profile("dev","beta")` —
  production needs this enabled under whatever profile actually serves it.
- `SsoUsedTokenCleanupJob` prunes `sso_used_token` hourly; same profile gating applies.
