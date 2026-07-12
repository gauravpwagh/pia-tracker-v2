#!/usr/bin/env bash
# On-demand backup of the database and MinIO objects into /opt/pia/backup.
#   /opt/pia/scripts/backup.sh
source "$(dirname "$0")/_lib.sh"
load_env

ts="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$ROOT/backup"

log "Dumping postgres…"
if podman exec ${PREFIX}-postgres pg_dump -U "${POSTGRES_USER:-pia}" -d "${POSTGRES_DB:-pia}" \
    | gzip > "$ROOT/backup/pg-$ts.sql.gz"; then
  ok "  $ROOT/backup/pg-$ts.sql.gz"
else
  warn "  postgres dump failed"
fi

log "Mirroring MinIO buckets…"
# --entrypoint sh is REQUIRED: the image's ENTRYPOINT is `mc`, so without this
# override, "sh -c '...'" is passed as ARGS to mc (which fails trying to run a
# subcommand literally named "sh") instead of running as a shell script.
if podman run --rm --network "$NETWORK" -v "$ROOT/backup:/backup:z" --entrypoint sh quay.io/minio/mc:latest -c "
  mc alias set local http://10.90.0.4:9000 '$MINIO_ROOT_USER' '$MINIO_ROOT_PASSWORD' &&
  mc mirror --overwrite local/${MINIO_BUCKET_ATTACHMENTS:-pia-attachments} /backup/minio-$ts/${MINIO_BUCKET_ATTACHMENTS:-pia-attachments}
"; then
  ok "  $ROOT/backup/minio-$ts/"
else
  warn "  MinIO mirror failed (podman logs pia-minio for details)"
fi


# Hand fresh dumps to the read-only pia-backup account (see infra/deploy/RUNBOOK.md
# "Off-VM backups") — no-op if that user/group was never created.
if getent group pia-backup >/dev/null 2>&1; then
  chown -R root:pia-backup "$ROOT/backup"
  find "$ROOT/backup" -type d -exec chmod 750 {} \;
  find "$ROOT/backup" -type f -exec chmod 640 {} \;
fi

ok "Backup done ($ts)."
