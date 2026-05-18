# PIA Tracker

Internal web application for Indian Railways to track Pre-Investment Activities for railway construction projects: land acquisition, forest clearance, utility shifting, drawing approvals, tender packaging, and temporary office space.

Replaces fragmented Excel + email workflows with a structured system that has audit trails, real-time dashboards, and proper access control.

---

## Status

**v1 in development.** See `docs/phasing.md` for the full plan; current phase indicated in `CHANGELOG.md`.

---

## Quickstart

Prerequisites: Docker, mkcert, JDK 21, Node 20, GNU make.

```bash
git clone <repo> pia-tracker
cd pia-tracker
make setup        # 10-12 min on a fresh laptop
```

Then `https://pia.local` opens automatically.

Other Makefile targets: see `make help` or the [Deployment doc](docs/deployment.md).

---

## Stack

- Kotlin 1.9 / Spring Boot 3.4 / Spring Data JPA + jOOQ on the backend
- React 18 + TypeScript + Vite + Ant Design + RJSF on the frontend
- PostgreSQL 16 (JSONB-heavy), MinIO + ClamAV for files
- Nginx + Docker Compose on a single VM
- Prometheus + Grafana + Loki for observability

---

## Documentation

Start with [`CLAUDE.md`](CLAUDE.md) for orientation. Then read the per-topic docs in [`docs/`](docs/):

- [Architecture](docs/architecture.md) — system overview, core patterns, conventions
- [Database](docs/database.md) — schema, JSONB conventions, partitioning
- [Workflow](docs/workflow.md) — state machine, drawings checklist
- [Permissions](docs/permissions.md) — designation registry, picker filters
- [Forms](docs/forms.md) — JSON Schema, RJSF widgets, per-activity catalogs
- [Dashboards](docs/dashboards.md) — summary tables, exports
- [UI](docs/ui.md) — page archetypes, theme, accessibility
- [API](docs/api.md) — REST conventions, endpoint catalog
- [Security](docs/security.md) — threat model, controls, incident response
- [Testing](docs/testing.md) — test pyramid, tooling, obligations
- [Deployment](docs/deployment.md) — local, beta, production, backup, observability
- [Phasing](docs/phasing.md) — release plan with acceptance gates

---

## License

Internal use only — Indian Railways.

---

## Contributing

See `CLAUDE.md` for conventions. Every PR that crosses an architectural boundary must update the relevant doc.
