#!/bin/sh
# Postgres backup loop — runs daily at 01:00 local time.
# Compatible with BusyBox date (alpine-based images).
# See docs/deployment.md § 6.

set -eu

BACKUP_DIR=/backups/pg
mkdir -p "$BACKUP_DIR"

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
    SLEEP=$(secs_until 1 0)
    [ "$SLEEP" -lt 60 ] && SLEEP=86400
    echo "[pgbackup] Next run in ${SLEEP}s"
    sleep "$SLEEP"

    STAMP=$(date +%Y%m%d-%H%M%S)
    OUT="${BACKUP_DIR}/pia-${STAMP}.dump"
    echo "[pgbackup] Dumping to ${OUT}"

    PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
        -h "$POSTGRES_HOST" \
        -U "$POSTGRES_USER" \
        -d "$POSTGRES_DB" \
        -Fc \
        -f "$OUT"

    gzip "$OUT"

    if [ -n "${GPG_BACKUP_RECIPIENT:-}" ] && command -v gpg >/dev/null 2>&1; then
        gpg --encrypt --recipient "$GPG_BACKUP_RECIPIENT" --output "${OUT}.gz.gpg" "${OUT}.gz"
        rm -f "${OUT}.gz"
    fi

    # Local retention: 7 days
    find "$BACKUP_DIR" -name "pia-*.dump.gz*" -mtime +7 -delete

    echo "[pgbackup] Done."
done
