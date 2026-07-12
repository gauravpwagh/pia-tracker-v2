# PIA Tracker — Offline Podman Deployment Runbook

Deploys PIA to an air-gapped RHEL VM under **rootful Podman**, self-contained and
isolated from the existing `crs` app (separate `10.90.0.0/24` network, own host ports
**8453/HTTP** and **8090/HTTPS**). Nothing about `crs` is ever touched.

Everything lives under **`infra/deploy/`**:
- `pc/*.ps1` (Windows + Docker Desktop) — the tooling:
  - `build.ps1` / `package.ps1` — build + compute the delta
  - **`deploy_scripts.ps1`** — push the VM tooling (bash scripts + unit + base images) to `/opt/pia/scripts`
  - **`deploy_project.ps1`** — deploy an app release (delta + app image)
  - `rollback.ps1`
- `vm/*.sh` + `pia.service` — the VM-side scripts, installed to `/opt/pia/scripts/`
- `docker-compose.production.yml`, `nginx/`, `postgres/init/`, `prometheus/`, `grafana/`,
  `.env.production.example` — the release **payload** that becomes each `releases/release-NNN`
  (the SPA `dist` + backend image are added by `build.ps1`).

> Two jobs, two scripts: **`deploy_scripts.ps1`** ships the *tooling*; **`deploy_project.ps1`**
> ships the *app release*. Users are **not** part of either — they are seeded automatically by
> Flyway from the backend image on deploy. See §6.

Layout created on the VM:
```
/opt/pia/
  releases/release-NNN/   current -> releases/release-NNN
  shared/.env  shared/certs/        # never overwritten by a deploy
  images/base/  images/app/         # base loaded once; app only when changed
  backup/ logs/ scripts/ tmp/
```

Prereqs on the VM (already present per your setup): `podman`, `podman-compose` (or
`podman compose`), `openssl`, `firewall-cmd`, SSH. The SSH user needs **passwordless
sudo** for `/opt/pia/scripts/*`.

---

## 0. First-time setup

**On the PC** — build everything and pull the base images (needs internet, once):
```powershell
cd infra\deploy\pc
.\build.ps1 -Base            # builds backend image + SPA dist + saves the 8 base images
.\package.ps1 -Release 1     # first release = full payload
```

**Bootstrap the VM** — push the tooling + base images (no app release yet):
```powershell
.\deploy_scripts.ps1 -VmHost <VM_IP> -VmUser <you> -WithBase
```

**On the VM** — prepare the host, then fill in secrets:
```bash
sudo /opt/pia/scripts/setup.sh          # layout, load+retag base images, certs, network, firewalld, systemd
sudo vi /opt/pia/shared/.env            # fill EVERY value — see note on postgres below
```
> **CRITICAL (gotcha #3):** postgres roles (`pia_app`, `pia_migrator`) are created only on
> the **first** DB init, from the `*_PASSWORD` values in `.env`. They MUST be correct
> before the first deploy, or the app fails with "password authentication failed" and you
> must wipe the `postgres_data` volume to recover. Also set `PIA_PUBLIC_BASE_URL` and
> `MINIO_PUBLIC_ENDPOINT` to the VM's reachable host/IP + port 8453.

**Then run the first deploy** (from the PC):
```powershell
.\deploy_project.ps1 -Release 1 -VmHost <VM_IP> -VmUser <you>
```

**Verify:**
```bash
sudo /opt/pia/scripts/status.sh
sudo /opt/pia/scripts/verify.sh
# open  http://<VM_IP>:8453/   (or https://<VM_IP>:8090/)
```

---

## 1. Deploy a new release (routine)

Edit source on the PC, then:
```powershell
cd infra\deploy\pc
.\build.ps1                          # rebuild backend/frontend (add nothing = reuse; -SkipBackend / -SkipFrontend to skip)
.\package.ps1 -Release 2             # computes the delta vs the last shipped release
.\deploy_project.ps1 -Release 2 -VmHost <VM_IP> -VmUser <you>
```
> Changed a VM bash script under `deploy/vm/` too? Push it with
> `.\deploy_scripts.ps1 -VmHost <VM_IP> -VmUser <you>` (no `-WithBase` needed).
- Only **changed files** transfer (usually KB). The **backend image tar transfers only
  if the backend actually changed** — otherwise it's skipped (saves GBs).
- `deploy.sh` builds `release-002` by hardlinking `release-001` and overlaying the changes,
  then flips `current` and restarts. Old releases are kept.

Bump the number each release (`-Release 3`, `4`, ...).

---

## 2. Rollback

```powershell
cd infra\deploy\pc
.\rollback.ps1 -VmHost <VM_IP> -VmUser <you>
```
or directly on the VM:
```bash
sudo /opt/pia/scripts/rollback.sh    # current -> previous release, restart
```
Releases are never deleted, so you can roll back and forward freely.

---

## 3. Status

```bash
sudo /opt/pia/scripts/status.sh      # current release, backend digest, running pia-* containers
```
From the PC: `ssh <you>@<VM_IP> "sudo /opt/pia/scripts/status.sh"`

---

## 4. Overwrite current (quick config fix, no new release number)

For a fast nginx/compose tweak without minting a new release:
```powershell
# PC: build + package as usual, but copy the bundle to the overwrite slot
.\build.ps1 -SkipBackend
.\package.ps1 -Release 2             # (same current number)
scp ..\out\release-002.files.tgz <you>@<VM_IP>:/opt/pia/tmp/overwrite.files.tgz
```
```bash
# VM: re-apply into the CURRENT release dir in place, then restart
sudo /opt/pia/scripts/overwrite-current.sh
```

---

## 5. Backup

```bash
sudo /opt/pia/scripts/backup.sh      # pg_dump.gz + MinIO mirror into /opt/pia/backup/
```

---

## 6. Users (seeded automatically — you don't import them by hand)

Officers are seeded by **Flyway migrations baked into the backend image**, applied
automatically every time the backend boots. You never run a manual `psql` import.

**To add or update the officer list:**
```powershell
# On the PC, regenerate the migrations from the HRMS CSV:
python ops\generate_user_migration.py <path-to-hrms.csv>
#   -> writes R__91_hrms_extra_zones.sql, R__92_hrms_designations.sql,
#      R__93_hrms_users.sql into backend\src\main\resources\db\data\
# Then a normal release (the backend image changes, so it ships once):
cd infra\deploy\pc
.\build.ps1
.\package.ps1 -Release N
.\deploy_project.ps1 -Release N -VmHost <VM_IP> -VmUser <you>
```
On boot, Flyway (repeatable migrations, idempotent) applies zones -> designations ->
users. Because the migrations set `employee_id` and leave `password_hash` NULL, every
officer's **initial password is their HRMS ID** (set on first login, changeable in
*My Profile*). Nothing else to do.

> The migrations are idempotent (`ON CONFLICT DO UPDATE` / `DO NOTHING`), so re-deploying
> re-applies them safely — no duplicates. Verify anytime:
> `ssh <you>@<VM_IP> "sudo podman exec pia-postgres psql -U pia -d pia -c 'SELECT count(*) FROM users;'"`

---

## 7. Dev environment (rootless, same VM, manual start/stop)

Dev runs the same stack **rootless under a dedicated `piadev` user** at `/opt/piadev` —
its podman storage (images/volumes/networks) is completely separate from prod's, so
names never collide and `podman volume rm` as piadev can never touch prod data.
Containers are `piadev-*`; ports 8455/8092; **no autostart** — start and stop by hand.

**One-time, as root on the VM:**
```bash
useradd piadev && passwd piadev
mkdir -p /opt/piadev && chown -R piadev:piadev /opt/piadev
loginctl enable-linger piadev        # containers survive SSH logout (does NOT autostart)
# only if other machines (e.g. the ABCDE test link) must reach dev:
firewall-cmd --permanent --add-port=8455/tcp --add-port=8092/tcp && firewall-cmd --reload
```

**Bootstrap dev (from the PC)** — same tooling, `piadev` user, `-NoSudo`:
```powershell
.\deploy_scripts.ps1 -VmHost <VM_IP> -VmUser piadev -Root /opt/piadev -WithBase
```
Then **as piadev on the VM**: `/opt/piadev/scripts/setup.sh`, edit `/opt/piadev/shared/.env`
and set at minimum: `PIA_PREFIX=piadev`, `PIA_SHARED=/opt/piadev/shared`,
`PIA_HTTP_PORT=8455`, `PIA_HTTPS_PORT=8092` (all four uncommented from the example),
plus its own passwords. Then from the PC:
```powershell
.\deploy_project.ps1 -Release N -VmHost <VM_IP> -VmUser piadev -Root /opt/piadev -NoSudo
```

**Manual start / stop (as piadev; saves RAM when dev is idle):**
```bash
/opt/piadev/scripts/start.sh    # bring the piadev-* stack up
/opt/piadev/scripts/stop.sh     # stop + remove containers; volumes/data persist
```

**Release flow:** package once, deploy the SAME bundle to dev first, verify, then prod.
Deltas are a single lineage — **both targets must receive every release in order**
(if prod skipped one, deploy the skipped bundle first, or repackage with `-Full`).
Dev is internal-only: test at `http://<VM_IP>:8455`; point ABCDE's *test* SSO link there.

---

## Notes / gotchas baked in

- **Auth profile:** the login stack (dummy / password / SSO) is gated to the dev/beta
  profiles, so `.env` ships `PIA_PROFILE=beta`. Do **not** set `prod` until a real prod
  auth provider exists, or there will be no way to log in.
- **TLS:** `setup.sh` generates a self-signed cert in `shared/certs/` for the 8090/HTTPS
  listener. Drop a real `pia.crt` / `pia.key` there to replace it. HTTP on 8453 has no
  forced redirect (a middleman may forward plain HTTP).
- **nginx resolver** is pinned to the network gateway `10.90.0.1` (Podman DNS), required
  because upstreams are proxied by container name.
- **MinIO buckets** are created by `start.sh` via a throwaway `mc` container (a compose
  one-shot would hang podman-compose).
- **Never** run `podman` commands that target `crs*` containers, its network, or its
  volumes. All PIA scripts only ever act on `pia-*` / the `pia` network / `/opt/pia`.
