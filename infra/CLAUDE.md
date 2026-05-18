# infra — Docker Compose, Nginx, observability

Infrastructure config: the docker-compose topology, Nginx vhost + TLS, Prometheus + Grafana provisioning, Loki + promtail, backup scripts.

## Layout

```
infra/
  docker-compose.yml         # base topology — see docs/deployment.md § 2
  docker-compose.dev.yml     # local overrides (volumes mounted from source for hot-reload, etc.)
  docker-compose.beta.yml    # beta overrides (production-like, but dummy auth toggleable)
  docker-compose.prod.yml    # production overrides (real auth required, resource limits, prod tags)
  nginx/
    nginx.conf               # top-level: workers, gzip, log format
    conf.d/pia.conf          # main vhost: TLS, reverse-proxy, security headers, SPA fallback
    spa.conf                 # inside-the-frontend-image SPA config
    certs/                   # gitignored; mkcert-generated locally
  prometheus/
    prometheus.yml           # scrape config
  grafana/
    provisioning/            # datasources + dashboard providers
    dashboards/              # JSON dashboards (Phase 2 onward)
  loki/
    config.yml
  promtail/
    promtail.yml             # tail docker container logs, ship to loki
  postgres/
    init/                    # any pre-Flyway init scripts (extensions, roles)
  scripts/
    setup.sh                 # one-shot install helpers (cert install, hosts entry, etc.)
    backup.sh                # on-demand backup
    restore.sh               # restore from snapshot
    pgbackup-loop.sh         # in-container loop for the pgbackup sidecar
    miniobackup-loop.sh      # in-container loop for the miniobackup sidecar
```

## Rules

- `docker-compose.yml` is the source of truth for the service topology. Environment-specific tweaks go in the overlay files; the base must be valid for any environment.
- Nginx is the TLS terminator. Backend never receives HTTPS directly. Security headers (CSP, HSTS, etc.) are set in the Nginx vhost — keep them there, not in the application.
- Internal services communicate over the `pia` network and are not exposed to the host.
- Only `nginx` binds host ports.
- Healthchecks are mandatory; `depends_on` clauses use `condition: service_healthy` for proper boot order.
- Volumes are named (not bind mounts) for production data: `postgres_data`, `minio_data`, etc. Bind mounts only for configs and certs.

## When you're touching this

If you change service topology or add a service, update `docs/deployment.md` § 2 in the same PR. The doc is the source of truth for "what runs where"; the compose file is its concrete instantiation.
