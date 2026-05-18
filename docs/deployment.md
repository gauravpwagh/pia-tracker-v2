# PIA Tracker — Deployment

**Status:** Draft v1.
**See also:** `architecture.md` § 10 (deploy architecture); `security.md` § 9 (audit log integrity), `security.md` § 2 (backup encryption).

This document specifies local development setup (Mode 1), beta deployment, production deployment, backup and restore procedures, observability, and the seed-data process.

---

## 1. Environments

| Environment | Auth mode | TLS | DB hosting | Notes |
|---|---|---|---|---|
| Local (Mode 1) | Dummy | mkcert local CA | Docker | Developer laptops; full feature set |
| Beta | Dummy or real (toggle) | Railway-network certs | Same VM as app | Real users, real workflows, sandboxed data |
| Production | Real (Keycloak) | Production certs | Co-located on app VM (v1) or separate (Phase 3) | Single-VM deployment at v1 |

All three run the same Docker Compose topology with different `.env` and `docker-compose.{env}.yml` overlay files.

---

## 2. Service topology

Single-VM docker-compose at v1. Services:

```
┌──────────┐
│  nginx   │ ← 443/TCP from clients (TLS terminator + static SPA host + API reverse-proxy)
└────┬─────┘
     │
     ├─→ backend (Spring Boot, port 8080)
     │       │
     │       ├─→ postgres (5432)
     │       ├─→ minio (9000)
     │       └─→ clamav (3310)
     │
     └─→ frontend (Nginx serving SPA — static files; merged into the main nginx in v1)

observability:
  prometheus, grafana, loki, promtail (sidecar log shipper)

backups:
  pgbackup (cron sidecar running pg_dump nightly)
  minio-backup (cron sidecar running mc mirror nightly)
```

All services run on an internal Docker network. Only Nginx is exposed to the host network (443 and optionally 80 for redirect).

The full topology is defined in `infra/docker-compose.yml`; environment-specific overlays in `infra/docker-compose.{dev,beta,prod}.yml`.

---

## 3. Local setup (Mode 1)

Prerequisites:

- Docker Desktop or equivalent (Docker Engine + Compose v2).
- mkcert installed (`brew install mkcert` / `choco install mkcert`).
- Java 21, Gradle 8.10+ (or via the wrapper).
- Node.js 20.x, npm 10.x.
- `make` (GNU make) for the task runner.

One-shot setup:

```bash
git clone <repo> pia-tracker
cd pia-tracker
make setup
```

`make setup` does:

1. `mkcert -install` — installs the local CA into the OS trust store.
2. `mkcert -cert-file infra/nginx/certs/pia.local-cert.pem -key-file infra/nginx/certs/pia.local-key.pem pia.local localhost 127.0.0.1`.
3. Adds `127.0.0.1 pia.local` to `/etc/hosts` (prompts for sudo).
4. Copies `.env.example` to `.env` if missing.
5. Pulls or builds all Docker images.
6. Boots Postgres alone and runs Flyway migrations.
7. Seeds reference data (zones, divisions, designations, demo users).
8. Boots everything else.
9. Tails health endpoints until all services are READY.
10. Opens `https://pia.local` in the default browser.

End-to-end: 8–12 minutes on a fresh machine, mostly Docker pulls. Subsequent `make up` is ~30 seconds.

Other Makefile targets:

```
make up               # docker compose up -d (assumes setup done)
make down             # docker compose down (preserves volumes)
make reset            # docker compose down -v (wipes data); requires confirmation
make migrate          # run Flyway migrations explicitly
make seed             # re-run reference + demo seed
make test             # backend unit + integration; frontend unit + component
make e2e              # docker compose up + Playwright tests
make lint             # ktlint + Detekt + ESLint + Prettier
make build-prod-image # build production-tagged Docker images
make logs             # tail all service logs
make backup           # one-shot backup invocation
make restore SNAPSHOT=<name>  # restore from a named snapshot
make psql             # connect to dev DB
```

---

## 4. Beta deployment

A single Railway-network VM running the same `docker-compose.yml` + `docker-compose.beta.yml`. Differences from local:

- Nginx serves Railway-issued TLS certs.
- The "BETA — sandboxed data" banner is on every page.
- Dummy auth remains enabled (default), or real auth pointed at a Keycloak staging realm (toggle via `PIA_AUTH_MODE` env var).
- Reference seed (zones, divisions, designations) runs at install; demo seed does not — beta starts empty and accumulates real test data.
- Backups enabled.

Deploy flow:

```bash
# On the beta VM, after a release tag:
cd /opt/pia-tracker
git fetch && git checkout v1.2.0
make build-prod-image
docker compose -f docker-compose.yml -f docker-compose.beta.yml up -d
docker compose ps   # verify all services healthy
docker compose logs backend --tail=200 | grep -i "Started PiaApplication"
```

Rollback: `git checkout v1.1.0 && make build-prod-image && docker compose ... up -d`. Postgres volume preserved; only stateless services swap.

For Flyway forward-only migrations, rollback requires a deliberate inverse migration shipped in a subsequent release, not a Flyway-level "undo". For this reason, every PR that adds a destructive migration must reference its inverse in the changelog.

---

## 5. Production deployment

Similar to beta with these hardening additions:

- Real Keycloak integration (`PIA_AUTH_MODE=real`); dummy auth code paths return 401.
- TLS via production Railway CA.
- All secret values from environment, populated by Ansible from the Railway ops vault.
- Daily backup retention 30 days online, 1 year offline.
- Prometheus alerts wired to Railway IT on-call rotation.
- Audit integrity job runs hourly (vs daily in dev/beta).
- The application Docker images are pulled from a Railway internal registry, not built on the VM.
- Resource limits set per service: backend `cpus: 4, mem: 8g`; postgres `cpus: 4, mem: 8g`; everything else smaller.

Phase 3 work (not v1): moving Postgres to a separate VM, introducing a read replica, putting MinIO behind an LB with a second node, putting Redis in for sessions/cache.

---

## 6. Backup and restore

### Postgres

A `pgbackup` sidecar runs nightly at 01:00:

```bash
pg_dump -Fc -d pia -h postgres -U pia_app | gzip | gpg --encrypt --recipient pia-backup > /backups/pg/$(date +%Y%m%d).dump.gz.gpg
```

Retention:

- Local: 7 days on the VM in `/backups/pg/`.
- Off-host (Phase 2 with offsite mount): 30 days.
- Cold offline (manual): a monthly snapshot copied to a removable encrypted drive.

The encryption key is a separate GPG key whose private half is held offline; backups can be made on the live VM but cannot be decrypted there.

### MinIO

Same cadence and retention model:

```bash
mc mirror --remove minio/pia-attachments /backups/minio/$(date +%Y%m%d)/
tar czf - /backups/minio/$(date +%Y%m%d)/ | gpg --encrypt --recipient pia-backup > /backups/minio/$(date +%Y%m%d).tar.gz.gpg
```

### Restore drills

A quarterly restore drill is mandatory:

1. Spin up a fresh VM (or VM equivalent).
2. Install Docker, decrypt the latest backup with the offline key.
3. Restore Postgres: `gpg --decrypt < .dump.gpg | gunzip | pg_restore -d pia -F c`.
4. Restore MinIO: `gpg --decrypt < .tar.gz.gpg | tar xz; mc mirror /restored/ minio-new/pia-attachments/`.
5. Bring up the application against the restored data.
6. Smoke-test: view a known project, verify attachments download, verify dashboard numbers match a recorded snapshot.

Drills are logged in `ops/runbooks/drill-log.md`. A failed drill is a P0 — backup is by definition broken if you can't restore.

---

## 7. Observability

### Metrics (Prometheus)

- Micrometer exposes JVM, HTTP, DB pool, and custom application metrics via `/actuator/prometheus`.
- Custom metrics:
  - `pia_workflow_transitions_total{action, from_state, to_state}` — counter.
  - `pia_record_save_duration_seconds{activity_type}` — histogram.
  - `pia_dashboard_query_duration_seconds{scope}` — histogram.
  - `pia_clamav_scan_duration_seconds` — histogram.
  - `pia_sla_breached_total` — counter.
- Prometheus scrape config in `infra/prometheus/prometheus.yml`. Scrape interval 15s.
- Retention: 30 days local; Phase 2 adds remote-write to a long-term store.

### Dashboards (Grafana)

Pre-built dashboards committed under `infra/grafana/dashboards/` and provisioned automatically:

- `application-overview.json`: requests/sec, p50/p95 latency by endpoint, error rate.
- `database.json`: connection pool, query duration distribution, slow queries log.
- `workflow.json`: transitions/min by action, SLA breaches.
- `security.json`: auth attempts, failed logins, security events.
- `business.json`: projects by state, records authenticated today, dashboards rendered.

### Logs (Loki + promtail)

All containers log to stdout in JSON. `promtail` is a sidecar that tails docker logs and ships to Loki.

Log levels:

- Production: `INFO` for application; `WARN` for libraries.
- Beta: `INFO` for everything.
- Local: `DEBUG` for `in.gov.ir.pia.*`; `INFO` for libraries.

Structured fields on every log line: `traceId`, `userId` (or `anonymous`), `endpoint`, `requestId`, plus the standard timestamp/level/logger/message.

### Alerting (Phase 2)

Grafana alerting on:

- 5xx rate > 1% for 5 min.
- p95 request latency > 2s for 5 min.
- DB connection pool utilization > 90% for 5 min.
- Audit integrity check failure (any).
- ClamAV unreachable for > 1 min.
- Backup job failure.

Alerts route to Railway IT on-call email + a Telegram channel (Phase 2 work; not v1).

---

## 8. Seed data

Two seed phases:

### Reference seed (always runs)

Populated by Flyway `db/data/V001_*` migrations at first install:

- 17 zones with codes, names.
- ~50 divisions across zones.
- Full designation registry (~25 designations).
- 6 activity types.
- Initial role definitions and role→permission bundles.
- Initial form_definitions for each activity (V101+).
- Initial workflow_definitions (project, record-standard).
- Initial dashboard_definitions.
- One SUPER_ADMIN user (credentials only in the install runbook).

### Demo seed (dev/local only)

Populated by `make seed` (or `--with-demo` flag on Flyway):

- 50 demo users, one per (designation, zone) combination for a handful of zones.
- 3 demo projects in different lifecycle states.
- ~30 demo records across activities, in various workflow states.
- Demo comments and notifications.

Production never runs the demo seed.

---

## 9. Networking

Single VM, single Nginx exposed. Default ports:

- 443: client traffic (HTTPS).
- 80: HTTP redirect to 443.

Internal Docker network:

- `nginx -> backend:8080`
- `backend -> postgres:5432, minio:9000, clamav:3310`
- `promtail -> loki:3100`
- `prometheus -> *:metrics ports`
- `grafana -> prometheus:9090, loki:3100`

No external internet egress required from app containers at runtime. Container images are pulled at deploy time; ClamAV definition updates are the one exception (freshclam pulls signatures from ClamAV upstream — configure proxy via env if egress is restricted).

---

## 10. Disaster recovery

RTO (recovery time objective): 4 hours.
RPO (recovery point objective): 24 hours (last nightly backup).

Disaster procedure outline:

1. New VM provisioned (manual or Phase 3 automated).
2. Docker + dependencies installed (`make setup` non-CA portions).
3. Latest encrypted Postgres + MinIO backups copied to the new VM.
4. GPG private key (offline) brought online temporarily, decryption performed, key wiped.
5. Postgres restored.
6. MinIO restored.
7. Docker Compose stack up.
8. DNS or load balancer cutover to the new VM.
9. Smoke tests per § 6 drill checklist.
10. Cutover-time audit log entry inserted by SUPER_ADMIN.

The runbook for this lives in `ops/runbooks/disaster-recovery.md` (skeleton at v1).

---

## 11. Health checks

Three endpoints:

- `/actuator/health/liveness` — am I running? Returns 200 if the JVM is up. Used by Docker healthcheck and orchestrator.
- `/actuator/health/readiness` — am I ready to take traffic? Returns 200 only after Flyway migrations succeed AND DB connection AND MinIO reachable AND ClamAV reachable. Used by Nginx upstream and any future orchestrator.
- `/actuator/info` — version, build timestamp, git SHA, active profiles.

Docker Compose healthchecks defined per service. The `depends_on` clauses use `condition: service_healthy` for proper boot order: postgres → minio + clamav → backend → frontend → nginx.

---

## 12. Upgrade procedure (in-place)

```bash
make backup                            # belt and braces
git fetch --tags
git checkout v{N}.{M}.{P}
make build-prod-image
docker compose pull                    # for any non-built services
docker compose up -d                   # rolling-style restart, depends_on respects order
docker compose ps                      # verify all healthy
# Smoke: check that "Started PiaApplication" recently in backend logs, hit /actuator/health/readiness
```

Database migrations run automatically on backend startup via Flyway. If a migration fails, the backend exits with non-zero; the previous version's image is still on the host so a quick `docker compose up -d --force-recreate backend` after `git checkout v{prev}` rolls back.

For destructive migrations (column drops, table renames): see deployment.md migration policy under "Forward-only forever". Always paired with an inverse migration in a follow-up release.

---

## 13. Capacity planning (v1 sizing)

Estimated workload:

- ~100 concurrent active users (CE/Cs, Dy CE/Cs, approvers).
- ~10,000 form save operations / day.
- ~50,000 dashboard / list queries / day.
- ~500 attachments / day, average 4 MB each.

VM sizing for v1:

- 8 vCPU, 32 GB RAM, 500 GB SSD, 1 Gbps NIC.
- Per service: backend ~6 GB heap, postgres ~12 GB shared_buffers, MinIO ~2 GB, ClamAV ~1.5 GB (signatures in memory), others ~2 GB combined.
- Storage growth estimate: ~20 GB / year for DB, ~700 GB / year for attachments (assumes accumulation, no pruning).

Phase 3 may split Postgres and MinIO onto dedicated VMs once attachment storage approaches 1 TB.
