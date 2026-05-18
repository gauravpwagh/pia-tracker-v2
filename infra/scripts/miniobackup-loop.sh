#!/bin/sh
# MinIO backup loop — mirrors the attachments bucket nightly.
# See docs/deployment.md § 6.

set -eu

BACKUP_DIR=/backups/minio
mkdir -p "$BACKUP_DIR"

mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null

while true; do
    NOW=$(date +%s)
    TARGET=$(date -d 'tomorrow 01:30' +%s 2>/dev/null || date -v+1d -v1H -v30M -v0S +%s)
    SLEEP=$((TARGET - NOW))
    [ "$SLEEP" -lt 60 ] && SLEEP=86400
    echo "[miniobackup] Next run in ${SLEEP}s"
    sleep "$SLEEP"

    STAMP=$(date +%Y%m%d-%H%M%S)
    OUT_DIR="${BACKUP_DIR}/${STAMP}"
    mkdir -p "$OUT_DIR"
    echo "[miniobackup] Mirroring to ${OUT_DIR}"
    mc mirror --remove local/pia-attachments "$OUT_DIR"

    tar czf "${OUT_DIR}.tar.gz" -C "$BACKUP_DIR" "$STAMP"
    rm -rf "$OUT_DIR"

    if [ -n "${GPG_BACKUP_RECIPIENT:-}" ] && command -v gpg >/dev/null 2>&1; then
        gpg --encrypt --recipient "$GPG_BACKUP_RECIPIENT" --output "${OUT_DIR}.tar.gz.gpg" "${OUT_DIR}.tar.gz"
        rm -f "${OUT_DIR}.tar.gz"
    fi

    find "$BACKUP_DIR" -name "*.tar.gz*" -mtime +7 -delete
    echo "[miniobackup] Done."
done
