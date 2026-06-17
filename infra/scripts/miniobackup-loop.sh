#!/bin/sh
# MinIO backup loop — mirrors the attachments bucket nightly at 01:30.
# Compatible with BusyBox date (alpine-based images).
# See docs/deployment.md § 6.

set -eu

BACKUP_DIR=/backups/minio
BUCKET="${MINIO_BUCKET_ATTACHMENTS:-pia-attachments}"
mkdir -p "$BACKUP_DIR"

mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null

# Compute seconds until next HH:MM in local TZ using only BusyBox-safe date calls.
secs_until() {
    TARGET_H=$1
    TARGET_M=$2
    NOW_H=$(date +%H)
    NOW_M=$(date +%M)
    NOW_S=$(date +%S)
    ELAPSED=$(( NOW_H * 3600 + NOW_M * 60 + NOW_S ))
    TARGET=$(( TARGET_H * 3600 + TARGET_M * 60 ))
    if [ "$ELAPSED" -lt "$TARGET" ]; then
        echo $(( TARGET - ELAPSED ))
    else
        echo $(( 86400 - ELAPSED + TARGET ))
    fi
}

while true; do
    SLEEP=$(secs_until 1 30)
    [ "$SLEEP" -lt 60 ] && SLEEP=86400
    echo "[miniobackup] Next run in ${SLEEP}s"
    sleep "$SLEEP"

    STAMP=$(date +%Y%m%d-%H%M%S)
    OUT_DIR="${BACKUP_DIR}/${STAMP}"
    mkdir -p "$OUT_DIR"
    echo "[miniobackup] Mirroring bucket ${BUCKET} to ${OUT_DIR}"
    mc mirror --remove "local/${BUCKET}" "$OUT_DIR"

    tar czf "${OUT_DIR}.tar.gz" -C "$BACKUP_DIR" "$STAMP"
    rm -rf "$OUT_DIR"

    if [ -n "${GPG_BACKUP_RECIPIENT:-}" ] && command -v gpg >/dev/null 2>&1; then
        gpg --encrypt --recipient "$GPG_BACKUP_RECIPIENT" --output "${OUT_DIR}.tar.gz.gpg" "${OUT_DIR}.tar.gz"
        rm -f "${OUT_DIR}.tar.gz"
    fi

    find "$BACKUP_DIR" -name "*.tar.gz*" -mtime +7 -delete
    echo "[miniobackup] Done."
done
