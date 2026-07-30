// Throwaway mock IdP for the PIA cross-site SSO POC.
// Simulates the ABCDE partner system: a logged-in user picks their identity,
// clicks "Open in PIA Tracker", and we mint a short-lived HS256 JWT and 302 to PIA.
// Mints sub/name/iat/exp plus designation_code/primary_zone_id — matching what
// SsoProvisioningService (backend) reads to auto-provision a user whose `sub` PIA
// doesn't already know about. See sso-poc/INTEGRATION_SPEC.md § 2 for the real
// claim contract and the caveat that these extra claim names aren't yet confirmed
// against a real ABCDE-issued token. NOT for production.

import express from 'express';
import jwt from 'jsonwebtoken';

const PORT = process.env.PORT || 9099;
const PIA_CALLBACK = process.env.PIA_CALLBACK || 'https://pia.local/api/v1/sso/callback';
// Must match backend pia.sso.secret (PIA_SSO_SECRET) exactly — see application-beta.yml.
const SHARED_SECRET = process.env.SSO_SECRET || 'dev-only-shared-secret-CHANGE-ME';
const TOKEN_TTL_SECONDS = 600; // 10 minutes, per the ABCDE integration doc

// A few real employee_ids pulled from PIA's users table so `sub` matches employee_id
// for the "already provisioned" rows — designation_code/zone_code are sent on the
// token too now, but ignored by PIA for an existing user (their stored designation
// is authoritative, never overwritten from a login token).
const USERS = [
  { sub: 'GAKZAI', name: 'RAJESH KUMAR SOOD', designation_code: 'CE_C', zone_code: 'NR' },
  { sub: 'NYXYIL', name: 'PRADEEP GOSWAMI', designation_code: 'DY_CE_C', zone_code: 'SECR' },
  { sub: 'AGFICM', name: 'SUNIL KUMAR VERMA', designation_code: 'CE_C', zone_code: 'SCR' },
  { sub: 'IXIHQC', name: 'GIRISH KUMAR RAO', designation_code: 'DY_CE_C', zone_code: 'ECoR' },
  { sub: 'AJGKNM', name: 'I. C. SUBHAS', designation_code: 'DY_CE_C', zone_code: 'NER' },
  { sub: 'WCOAGL', name: 'AMIT KUMAR', designation_code: 'DY_CE_C', zone_code: 'SER' },
  // An id PIA does NOT already know — this is the auto-provisioning demo row. PIA
  // will create a fully active CE_C/NR account for it on first login.
  { sub: 'UNKNOWN99', name: 'Not In PIA Yet', designation_code: 'CE_C', zone_code: 'NR' },
];

function mintToken(user) {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      sub: user.sub,
      name: user.name,
      designation_code: user.designation_code,
      primary_zone_id: user.zone_code,
      iat: now,
      exp: now + TOKEN_TTL_SECONDS,
    },
    SHARED_SECRET,
    { algorithm: 'HS256', header: { typ: 'JWT' } },
  );
}

const app = express();

// Landing page: the "partner" home, listing logged-in users to impersonate.
app.get('/', (_req, res) => {
  const rows = USERS.map(
    (u) => `
      <tr>
        <td>${u.name}</td>
        <td><code>${u.sub}</code></td>
        <td>${u.designation_code}</td>
        <td>${u.zone_code}</td>
        <td><a class="btn" href="/sso/handoff?target=pia&amp;sub=${u.sub}">Open in PIA Tracker →</a></td>
      </tr>`,
  ).join('');
  res.type('html').send(`<!doctype html>
    <html><head><meta charset="utf-8"><title>Mock Partner (IdP) — PIA SSO POC</title>
    <style>
      body{font-family:system-ui,sans-serif;max-width:900px;margin:40px auto;padding:0 16px;color:#1a1a1a}
      h1{font-size:20px} p{color:#555}
      table{border-collapse:collapse;width:100%;margin-top:16px}
      td,th{border:1px solid #ddd;padding:8px 10px;text-align:left;font-size:14px}
      th{background:#f5f5f5}
      .btn{display:inline-block;background:#1565c0;color:#fff;padding:6px 10px;border-radius:4px;text-decoration:none;font-size:13px}
      code{background:#f0f0f0;padding:1px 4px;border-radius:3px}
    </style></head>
    <body>
      <h1>Mock Partner System (IdP)</h1>
      <p>Pretend each row is an already-logged-in officer. Click to mint an HS256 JWT
         (sub, name, designation_code, primary_zone_id, iat, exp) and hand off to PIA at
         <code>${PIA_CALLBACK}</code>. The last row is unknown to PIA — expect it to be
         auto-provisioned as a fully active account on first login, not rejected.</p>
      <table>
        <tr><th>Name</th><th>Login ID (sub)</th><th>Designation</th><th>Zone</th><th></th></tr>
        ${rows}
      </table>
    </body></html>`);
});

// The handoff endpoint the "Open in PIA" button hits.
app.get('/sso/handoff', (req, res) => {
  const user = USERS.find((u) => u.sub === req.query.sub);
  if (!user) return res.status(404).send('Unknown user in mock IdP');
  const token = mintToken(user);
  res.redirect(302, `${PIA_CALLBACK}?token=${encodeURIComponent(token)}`);
});

app.listen(PORT, () => {
  console.log(`Mock IdP on http://localhost:${PORT}  (HS256 → ${PIA_CALLBACK})`);
});
