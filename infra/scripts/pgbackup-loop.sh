#!/bin/sh
# Postgres backup loop — runs daily at 01:00 by default.
# See docs/deployment.md § 6.

set -eu

BACKUP_DIR=/backups/pg
mkdir -p "$BACKUP_DIR"

while true; do
    # Sleep until next 01:00
    NOW=$(date +%s)
    TARGET=$(date -d 'tomorrow 01:00' +%s 2>/dev/null || date -v+1d -v1H -v0M -v0S +%s)
    SLEEP=$((TARGET - NOW))
    [ "$SLEEP" -lt 60 ] && SLEEP=86400
    echo "[pgbackup] Next run in ${SLEEP}s ($(date -d "@$TARGET" 2>/dev/null || date -r "$TARGET"))"
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
