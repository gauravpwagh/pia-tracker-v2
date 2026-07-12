# Handover — PIA offline Podman deploy (first run in progress)

Resume point for a new session. Working dir: `D:\Sagar\Project\Claude\pia-tracker-beta`.
Deployment system lives under **`infra/deploy/`**. Memory file: `project_pia_beta_deploy.md`
(also `project_pia_password_login.md`, `project_pia_sso_bridge.md`). Keep answers short.

VM: `root@192.168.0.240`, rootful podman, air-gapped RHEL. A separate `crs` app also runs
there (network `crs_digitalization_default`, `10.89.x`) — **never touch it**.

## Where we are RIGHT NOW (the one thing to finish)

Still trying to get the **very first** `release-001` fully up on the VM. Four *different*
bugs have been hit and fixed in this repo so far (see "Fixes already made" below); each
fix required a rebuild + repackage + redeploy, and we have not yet had a clean end-to-end
run since the last fix (seed-ordering, V085_001). **Next step is simply to run the deploy
one more time** with everything currently fixed, and confirm it comes up clean.

### Do this next (from a clean slate, PC + VM)

**PC — build + package (payload and image already fixed; skip build if nothing changed):**
```powershell
cd infra\deploy\pc
.\build.ps1 -SkipFrontend           # only if backend/migrations changed since last build
.\package.ps1 -Release 1 -Full      # -Full is REQUIRED whenever the VM side is wiped/fresh
```
Check the output says **"52 changed file(s)"** (or similar full count), NOT "0 changed" /
"1 changed" — a tiny delta means `.ship-state` came back and the bundle will be broken
(missing nginx/postgres/frontend configs → podman mount errors). If it's small, delete
`infra\deploy\.ship-state\*` and repackage with `-Full`.

**VM — full wipe (pia only; never touches crs), because podman NAMED VOLUMES persist
independently of containers — `podman rm`/`compose down` do NOT delete them:**
```bash
sudo bash -c 'cd /opt/pia/current 2>/dev/null && { podman-compose -f docker-compose.production.yml down 2>/dev/null || podman compose -f docker-compose.production.yml down 2>/dev/null; }; true'
sudo podman ps -aq --filter name=pia- | xargs -r sudo podman rm -f
sudo podman volume ls -q | grep postgres_data | xargs -r sudo podman volume rm -f
sudo podman volume ls | grep -i pia          # postgres_data must NOT be listed — if it is, repeat
sudo rm -rf /opt/pia/releases /opt/pia/current /opt/pia/tmp
sudo mkdir -p /opt/pia/releases /opt/pia/tmp
```
Keep `/opt/pia/shared` (.env, certs) and `/opt/pia/images` (base+app images) — don't delete these.

**PC — deploy:**
```powershell
.\deploy_project.ps1 -Release 1 -VmHost 192.168.0.240 -VmUser root
```

**Verify:**
```bash
sudo podman ps --filter name=pia- --format '{{.Names}}\t{{.Status}}'   # all Up (healthy)
sudo podman exec pia-postgres psql -U pia -d pia -c "SELECT employee_id, name FROM users;"
# MUST show exactly: ADMIN001, SADMIN001 — nothing else
# open http://192.168.0.240:8453/  → log in ADMIN001/admin123 or SADMIN001/sadmin123
```

If containers fail to start with `crun: mount ... : Not a directory` for any config file
(nginx.conf, prometheus.yml, etc.) → the release directory has a bogus podman-fabricated
directory from a prior partial deploy. Delete `/opt/pia/releases/release-001` entirely
(not just the file) and redeploy the FULL bundle — see "Fixes already made" #3 below.

If the backend container restarts/crashes, check:
```bash
sudo podman logs --tail 60 pia-backend 2>&1 | grep -iE 'flyway|migrat|ERROR|Exception'
```

## Config in effect
- VM network `pia`, `10.90.0.0/24` gw `10.90.0.1`, **not external** — declared with
  `name: pia` + explicit `ipam` subnet in the compose file (see fix #1). Static IPs:
  .2 postgres .3 backend .4 minio .5 clamav .6 prometheus .7 grafana .8 loki .10 nginx.
  crs on 10.89.x — untouched.
- Host ports from `.env`: **8453→80 (HTTP), 8090→443 (HTTPS)**, no forced redirect.
- `.env` on VM at `/opt/pia/shared/.env` (never overwritten by a deploy). Key values:
  `PIA_PROFILE=beta` (REQUIRED — auth is dev/beta-gated), `PIA_PUBLIC_BASE_URL=http://192.168.0.240:8453`,
  `MINIO_PUBLIC_ENDPOINT=http://192.168.0.240:8453/minio`, plus the 4 DB/MinIO/Grafana passwords.
  **Gotcha #3:** these passwords are baked into Postgres on the FIRST init of the
  `pia_postgres_data` volume — get them right before the first deploy, or wipe-and-redo
  is the only fix.
- Deploy order: `setup.sh` (creates layout + `pia` network; doesn't need `.env`) → edit
  `.env` → `deploy_project.ps1` (this is when `.env` values actually get consumed).

## User seeding — RESOLVED, this was the big open item
User wants the DB to start with **only two system admins**; everyone else added later
via `scripts/import_users.py`. Implemented in
`backend/src/main/resources/db/data/`:
- **`V001_004__seed_demo_users.sql`** — emptied to a no-op (kept only to preserve the
  Flyway version sequence).
- **`V085_001__seed_system_users.sql`** — NEW file, seeds exactly two users:
  `ADMIN001` / password `admin123` (designation `ADMIN` → `ROLE_ADMIN`) and
  `SADMIN001` / password `sadmin123` (designation `SUPER_ADMIN` → `ROLE_SUPER_ADMIN`).
  Passwords are literal BCrypt hashes (`$2a$10$...`, strength 10, matches the backend's
  `BCryptPasswordEncoder`), written directly into `password_hash` — login works
  immediately, no first-login lazy-init needed. **Must be numbered AFTER V085**
  (`users_add_password_hash.sql`) — V001_004 crashed with "column password_hash does
  not exist" because it ran before V085 added that column. This was fix #4 below.
- **Deleted** 7 other user-seed migrations that inserted demo/test/HRMS users:
  `V001_009, V001_010, V014_001, V016, V017_001, V082_002, R__93`. Verified FK-safe —
  nothing else references them (checked with grep across all `db/data/*.sql`).
- Verified: extracted `app.jar` from the built image and confirmed `V085_001` has the
  two admins and `V001_004` has zero `INSERT INTO users`.
- Dockerfile builds with `gradlew bootJar -x test`, so tests are skipped at image build
  — the image builds fine even though 6 integration test files still reference the old
  `EMP00x` demo users (`make test` would fail on those; not yet fixed; low priority).

## scripts/import_users.py — extended, ready to use
Original script only ran locally against `docker exec`. Extended with:
- `--ssh USER@HOST` — reach the DB on the remote VM over SSH (stdin-piped SQL, no `-c`
  quoting issues).
- `--runtime podman` — use podman instead of docker.
- `--sudo` — prefix container command with sudo (not needed when SSH'd in as root).
- `--hash-password` — BCrypt-hash a password into `password_hash` at insert time
  instead of leaving it NULL for lazy first-login init. Default: hashes each user's own
  HRMS id (`employee_id`). `--password 'X'` hashes a fixed value for everyone instead.
- `--out-sql FILE` — **offline mode** (recommended for the air-gapped VM to avoid SSH
  password prompts per-row): generates idempotent `INSERT ... ON CONFLICT (employee_id)
  DO NOTHING` statements into a local .sql file (with BCrypt hashes baked in), no DB
  connection at all. Then one `scp` + one `psql -f` on the VM applies everything in a
  single shot. Recommended workflow:
  ```powershell
  pip install bcrypt   # one-time on the PC
  python scripts\import_users.py users.csv --out-sql users.sql --hash-password
  scp users.sql root@192.168.0.240:/tmp/users.sql
  ssh root@192.168.0.240 "sudo podman cp /tmp/users.sql pia-postgres:/tmp/users.sql && sudo podman exec pia-postgres psql -U pia -d pia -f /tmp/users.sql"
  ```
  (Online mode with `--ssh` also works but opens one SSH connection per row — slow /
  password-prompt-heavy unless SSH key auth is set up.)
- CSV header aliases already handle the user's real HRMS export format:
  `emp_hrms_id→employee_id, employee_name→name, desig_desc→desig_raw, zone_code→zone`.
  Only CE-family designations map to a role-bearing code (`CE→CE_C`, `Dy CE→DY_CE_C`,
  `CAO→CAO_C`, `ED→EDGS_CI`); everything else is skipped in the preview table — user
  should confirm their designation list is all in-scope before the real import.
- Recommend user sets up SSH key auth (`ssh-keygen` + copy `id_ed25519.pub` to VM
  `~/.ssh/authorized_keys`) to kill password prompts for deploy scripts too — offered,
  not yet confirmed done.

## Deploy system layout (all validated: compose config OK, bash -n OK, PS parse OK)
`infra/deploy/`: `pc/*.ps1` (`build.ps1`, `package.ps1` [now has `-Full` switch — see fix
#2], `deploy_scripts.ps1` = push VM tooling+base images, `deploy_project.ps1` = deploy a
release, `rollback.ps1`) · `vm/*.sh` + `pia.service` (installed to `/opt/pia/scripts`) ·
`docker-compose.production.yml`, `nginx/`, `postgres/init/`, `prometheus/`, `grafana/`,
`.env.production.example` (the release payload) · `RUNBOOK.md`.
Incremental by design: base images shipped once, backend image only when digest changes,
project files as deltas (hardlink prev release + `tar --unlink-first` overlay). Atomic
`current` symlink swap.

## Fixes already made this session (don't redo — read before touching these areas again)

1. **Network collision (`pia_pia`).** Root cause: the compose network had no `name:`,
   so podman-compose derived a project-scoped `pia_pia` and tried to create it on the
   same subnet as the pre-created `pia` → "subnet already used", deploy aborted before
   compose-up. **Fix, in `docker-compose.production.yml`:** network is now
   `pia: { name: pia, ipam.config: [subnet 10.90.0.0/24, gateway 10.90.0.1] }` — NOT
   `external: true` (an intermediate attempt; rejected because every service pins a
   static `ipv4_address` and `external:true` declares no subnet, which is fragile).
   Also added `ensure_network()` to `vm/_lib.sh` (idempotent + collision-aware: auto-
   removes a leftover `*_pia` network, never touches crs), used by both `setup.sh` and
   `start.sh`.

2. **Stale/partial bundle from incremental packaging (`package.ps1`).** `package.ps1`
   ships only a delta vs `infra/deploy/.ship-state`. On a wiped/fresh VM there's no
   previous release to hardlink the unchanged files from, so a delta-only bundle left
   the release missing nginx/postgres/frontend files entirely. **Fix:** added a `-Full`
   switch to `package.ps1` that ignores ship-state and bundles the entire payload
   (52 files). **Rule: from-scratch or wiped-VM deploys must use `-Full`.** Also: the
   local `.ship-state/` was cleared more than once during this session because it kept
   silently reappearing and producing tiny (0-1 file) bundles — if `package.ps1` ever
   reports a suspiciously small file count, delete `.ship-state/*` and repackage with
   `-Full`.

3. **Podman auto-creates missing bind-mount sources as directories.** Direct consequence
   of fix #2 while it was still broken: because `nginx/nginx.conf` (and later
   `prometheus/prometheus.yml`) were missing from the extracted release, podman/crun
   silently created them as **directories** at container start, then failed with
   `crun: mount ... : Not a directory`. Merely fixing the bundle afterward isn't enough
   — the bogus directory persists in `/opt/pia/releases/release-001/...` until that
   release dir is deleted. **Recovery pattern:** always `rm -rf
   /opt/pia/releases/release-001` (the whole dir, not the file) before redeploying a
   corrected full bundle.

4. **Podman named volumes persist independently of containers (user's core confusion,
   now resolved).** `pia_postgres_data` lives on the VM host at
   `/var/lib/containers/storage/volumes/pia_postgres_data/_data`. `podman rm` and
   `compose down` do NOT delete named volumes — recreating the container reattaches the
   SAME data, so old/seeded users (up to 501 rows from an earlier HRMS-seeding image)
   kept reappearing even after deleting the seed migrations. Flyway only ever ADDS rows,
   never deletes ones a removed migration previously inserted. **The only real fix is
   `podman volume rm -f pia_postgres_data`** (after removing any container that holds
   it), confirmed empty with `podman volume ls | grep postgres_data` printing nothing,
   THEN start fresh.

5. **Seed migration ordering bug.** First attempt at the admin-only seed put
   `password_hash`/`password_updated_at` values into the repurposed `V001_004` — but
   that column is only added by schema migration `V085`, and Flyway runs `V001_004`
   long before `V085` → boot crash `ERROR: column "password_hash" of relation "users"
   does not exist`, backend never starts, DB left with schema only + a failed migration
   record. **Fix:** emptied `V001_004`, moved the seed into new
   `V085_001__seed_system_users.sql` (85.1 > 85 → runs after). General lesson: any data
   seed that writes to a column must be numbered after the schema migration that adds
   that column.

6. Earlier misc fixes (from a prior session, still valid): `build.ps1` builds frontend
   `--target build` only (runtime stage COPYs `infra/nginx/spa.conf` outside the
   frontend context); PS helper funcs renamed `Invoke-Ssh`/`Invoke-Scp` (a func named
   `Scp` shadowed `scp.exe` → infinite recursion); PS scripts saved UTF-8 **with BOM**
   (em-dash/ellipsis in string literals broke Windows PowerShell 5.1 parsing otherwise);
   only "Claude" mention in frontend (`frontend/src/pages/Home.tsx`) replaced with `cris`.

## Not yet done / open items for the next session
- Confirm the deploy actually completes cleanly end-to-end (all fixes above have been
  made and individually verified, but not yet chained through one full successful run).
- After it's up: run `scripts/import_users.py --out-sql` for the user's real officer CSV
  and apply it.
- Optional: fix the 6 integration test files that reference deleted `EMP00x` demo users
  (`make test` currently fails on them; doesn't affect deployment).
- Optional: set up SSH key auth on the PC→VM link to remove password prompts entirely.
- Optional: add a short note to `RUNBOOK.md` about the offline `--out-sql` import
  workflow and the `-Full` packaging rule for from-scratch deploys.
