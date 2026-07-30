# PIA Tracker — Cross-Site SSO Handoff Spec (JWT)

This is the contract the **partner system** ("ABCDE") implements so its already-logged-in
users can click a button and land in PIA Tracker already authenticated.

Trust model: **PIA never reads or trusts the partner's session cookies.** The partner
mints a short-lived, signed JWT and redirects to PIA. PIA trusts only the signature.

> This spec was originally drafted around an RS256 (asymmetric) design — see git history
> if you need it. The partner's actual stack only supports **HS256** (shared secret), so
> that is what's implemented.
>
> **Update:** the original design below required `designation_code`/`zone_code` to be
> absent from the token, with users provisioned only via CSV import ahead of time. That
> policy has been reversed — PIA now auto-provisions a fully active account from the
> token's claims on first login for an unrecognized `sub`. See § 1 and § 3 for the
> current behaviour, and `SsoProvisioningService`'s doc comment (backend) for the
> security tradeoff this accepts. Real captured claim names should be verified against
> what's written below before go-live — see the note in § 2.

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

An unrecognized `sub` is now **auto-provisioned** as a fully active PIA account — see
§ 3 step 5 and `SsoProvisioningService` (backend). Users already provisioned via
`scripts/import_users_abcde.py` (or any other path) bridge in as before; provisioning
only kicks in for a genuinely unrecognized `sub`.

## 2. JWT

**Claims:**

| Claim              | Req | Meaning                                                              |
|---------------------|-----|-----------------------------------------------------------------------|
| `sub`               | ✔   | Login ID. Joins to PIA `users.employee_id`.                          |
| `name`              | ✔   | Display name. For an existing user this is informational only — PIA does **not** sync `users.name` from this claim, the CSV import is the source of truth. For a newly auto-provisioned user, this claim **is** used as the initial `users.name`. |
| `iat`               | ✔   | Issued-at (epoch seconds). Must be within ±60s of PIA's clock.        |
| `exp`               | ✔   | Expiry. **TTL = 10 minutes** per the ABCDE doc.                       |
| `designation_code`  | only for provisioning | PIA designation code (e.g. `CE_C`, `DY_CE_C`). Required to auto-provision a new user — determines their role via `designation_default_roles`, same as every other user in the system. Ignored for an already-provisioned user (their existing `designation_code` is authoritative, never overwritten from the token). |
| `primary_zone_id`   | optional | Zone code (e.g. `NR`, `CR`) or a raw PIA zone UUID. Resolved to `users.primary_zone_id` at provisioning time. Absent → provisioned with a null (pan-India-style) zone — fine for a zone-exempt designation, limiting for a zone-scoped one. |

No `iss`, `aud`, or `jti`. `division_code`, `phone_number`, `hrmsid`, `role` have been
observed on real tokens but are **not currently consumed** by
`SsoProvisioningService` — see its doc comment.

> **Verify before relying on this in production**: the claim names above for
> `designation_code`/`primary_zone_id` are the backend's best read of what the real
> partner sends, based on a developer's own debug-log observation — not a confirmed,
> documented sample. Confirm exact key names/casing with a real captured token before
> go-live; a silent name mismatch means provisioning always falls through to rejection
> (safe, but not what you'd expect if you thought it was configured).

**Signing:** HS256, shared secret between ABCDE and PIA (`pia.sso.secret` /
`PIA_SSO_SECRET` — never committed to the repo, exchanged out-of-band).

### Example claims
```json
{
  "sub": "110123456",
  "name": "John Smith",
  "designation_code": "CE_C",
  "primary_zone_id": "NR",
  "iat": 1750000000,
  "exp": 1750000600
}
```

## 3. What PIA does with the token (`GET /api/v1/sso/callback`)

See `backend/src/main/kotlin/in/gov/ir/pia/security/SsoTokenVerifier.kt`,
`backend/src/main/kotlin/in/gov/ir/pia/api/SsoCallbackController.kt`, and
`backend/src/main/kotlin/in/gov/ir/pia/service/auth/SsoProvisioningService.kt` — this is
the authoritative implementation; the steps below just summarize it.

1. Verify HS256 signature with the shared secret. Bad → `401 SIGNATURE_INVALID`.
2. Assert `exp` not passed and `iat` within skew. Fail → `401 EXPIRED` / `401 ISSUED_IN_FUTURE`.
3. Reject tokens whose lifetime (`exp - iat`) exceeds `pia.sso.max-token-lifetime-seconds`
   (600s, i.e. 10 minutes) → `401 LIFETIME_TOO_LONG`.
4. Reject replay: the token has no `jti`, so PIA hashes the raw token (SHA-256) and
   records it in `sso_used_token` on first use. A repeat → `401 REPLAY`. This guards
   against a captured redirect URL (browser history, server/proxy logs) being reused
   within the 10-minute window.
5. `user = users where employee_id = sub, active, not deleted`. Found → bridge in as
   normal. **Not found** → `SsoProvisioningService` creates a new, fully active user
   from the token's `name`/`designation_code`/`primary_zone_id` claims. Missing/invalid
   `designation_code`, or a `primary_zone_id` that doesn't resolve to a known zone →
   `403` (provisioning refused, not a silent partial account). An `employee_id` that
   exists but is inactive/deleted → `403` (never silently reactivated).
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
- Auto-provisioning (§ 3 step 5) trusts `designation_code`/`primary_zone_id` from the
  token to grant a real role on the spot — token integrity (HS256 signature + shared
  secret secrecy) is the *only* thing standing between "has a validly-signed token for
  an unknown `sub`" and "has a live PIA account with that designation's permissions."
  Confirm this is genuinely the intended production posture, and confirm the real
  claim names (§ 2) against an actual captured token, before this profile gating is
  ever relaxed.
