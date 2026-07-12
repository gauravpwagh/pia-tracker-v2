#!/usr/bin/env bash
# Post-deploy smoke checks. Non-destructive; exits non-zero if a check fails.
#   /opt/pia/scripts/verify.sh
source "$(dirname "$0")/_lib.sh"
load_env

fail=0

log "Container health:"
for c in "$PREFIX-postgres" "$PREFIX-backend" "$PREFIX-minio" "$PREFIX-nginx"; do
  st="$(podman inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$c" 2>/dev/null || echo missing)"
  printf '  %-14s %s\n' "$c" "$st"
  case "$st" in healthy|running) ;; *) fail=1 ;; esac
done

log "Backend readiness (inside container):"
if podman exec "${PREFIX}-backend" curl -fsS http://localhost:8080/actuator/health/readiness >/dev/null 2>&1; then
  ok "  backend readiness OK"
else
  warn "  backend readiness FAILED"; fail=1
fi

log "SPA over host HTTP port ${PIA_HTTP_PORT:-8453}:"
if curl -fsS "http://localhost:${PIA_HTTP_PORT:-8453}/" >/dev/null 2>&1; then
  ok "  SPA reachable"
else
  warn "  SPA not reachable on host port"; fail=1
fi

[ "$fail" -eq 0 ] && ok "All checks passed." || die "One or more checks failed."
