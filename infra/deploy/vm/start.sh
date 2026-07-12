#!/usr/bin/env bash
# Start (or reconcile) the PIA stack for the CURRENT release. Idempotent.
#   /opt/pia/scripts/start.sh
#
# Handles the podman/RHEL gotchas: creates the network first (#11), brings the stack
# up from the single self-contained compose (#1) with fully-qualified images (#2),
# then creates the MinIO buckets via a throwaway `podman run` instead of a compose
# one-shot (#8, which would hang podman-compose).
source "$(dirname "$0")/_lib.sh"

[ -L "$CURRENT" ] || die "No current release. Run a deploy first."
load_env

# Network first (older podman-compose won't auto-create it) — gotcha #11.
# Idempotent + collision-aware: reuses `pia` if present, cleans a leftover pia net.
ensure_network

cd "$CURRENT"
log "Bringing up the stack…"
# --force-recreate on backend+nginx: compose only recreates a container when the
# COMPOSE FILE TEXT changes, but that text is identical release-to-release (the
# frontend bind-mount source and the backend image tag both resolve differently
# without the text changing). Without this, a release can "deploy successfully"
# while the running containers keep serving/running the PREVIOUS release's
# frontend/dist and image — silently. postgres/minio/clamav are left alone
# (data containers; no code changes to pick up, no reason to churn them).
compose -f docker-compose.production.yml up -d --force-recreate backend nginx
compose -f docker-compose.production.yml up -d

# Wait for postgres to be healthy before touching MinIO / declaring success.
log "Waiting for postgres…"
for _ in $(seq 1 30); do
  status="$(podman inspect -f '{{.State.Health.Status}}' ${PREFIX}-postgres 2>/dev/null || echo starting)"
  [ "$status" = "healthy" ] && break
  sleep 3
done

# MinIO buckets via a throwaway mc container (NOT a compose one-shot) — gotcha #8.
# --entrypoint sh is REQUIRED: the image's own ENTRYPOINT is `mc`, so without this
# override, "sh -c '...'" is passed as ARGS to mc itself (mc tries to run a
# subcommand literally named "sh" and fails) instead of running as a shell script.
log "Ensuring MinIO buckets…"
if ! podman run --rm --network "$NETWORK" --entrypoint sh quay.io/minio/mc:latest -c "
  mc alias set local http://10.90.0.4:9000 '$MINIO_ROOT_USER' '$MINIO_ROOT_PASSWORD' &&
  mc mb --ignore-existing local/${MINIO_BUCKET_ATTACHMENTS:-pia-attachments} &&
  mc mb --ignore-existing local/${MINIO_BUCKET_QUARANTINE:-pia-quarantine}
"; then
  warn "Bucket init failed — check MinIO (podman logs pia-minio)."
fi

ok "Stack started for $(current_release). Ports: HTTP ${PIA_HTTP_PORT:-8453}, HTTPS ${PIA_HTTPS_PORT:-8090}."
