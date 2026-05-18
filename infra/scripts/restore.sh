#!/bin/bash
# Restore from a named snapshot.
# Usage: ./restore.sh <YYYYMMDD>
# See docs/deployment.md § 6.

set -euo pipefail

cd "$(dirname "$0")/.."

SNAPSHOT="${1:-}"
if [[ -z "$SNAPSHOT" ]]; then
    echo "Usage: $0 <YYYYMMDD>"
    exit 1
fi

echo "Restoring from snapshot ${SNAPSHOT}"
echo "This will OVERWRITE current data. Type the snapshot date to confirm:"
read -r confirm
if [[ "$confirm" != "$SNAPSHOT" ]]; then
    echo "Aborted."
    exit 1
fi

# Stop the app so nothing writes during restore
docker compose -f docker-compose.yml stop backend

# Find the matching pg backup file
PG_FILE=$(docker compose -f docker-compose.yml exec -T pgbackup sh -c \
    "ls /backups/pg/pia-${SNAPSHOT}* 2>/dev/null | head -1")
if [[ -z "$PG_FILE" ]]; then
    echo "No Postgres backup found for ${SNAPSHOT} under /backups/pg/"
    exit 1
fi

echo "Restoring Postgres from ${PG_FILE}"
docker compose -f docker-compose.yml exec -T pgbackup sh -c "
    if [[ '${PG_FILE}' == *.gpg ]]; then
        gpg --decrypt '${PG_FILE}' | gunzip | PGPASSWORD=\$POSTGRES_PASSWORD pg_restore -h \$POSTGRES_HOST -U \$POSTGRES_USER -d \$POSTGRES_DB --clean --if-exists
    else
        gunzip -c '${PG_FILE}' | PGPASSWORD=\$POSTGRES_PASSWORD pg_restore -h \$POSTGRES_HOST -U \$POSTGRES_USER -d \$POSTGRES_DB --clean --if-exists
    fi
"

echo "Restoring MinIO from /backups/minio/${SNAPSHOT}*"
docker compose -f docker-compose.yml exec -T miniobackup sh -c "
    MINIO_DIR=\$(ls -d /backups/minio/${SNAPSHOT}* 2>/dev/null | head -1)
    if [[ -z \"\$MINIO_DIR\" ]]; then
        echo 'No MinIO backup found.'
        exit 1
    fi
    mc alias set local http://minio:9000 \$MINIO_ROOT_USER \$MINIO_ROOT_PASSWORD >/dev/null
    if [[ \"\$MINIO_DIR\" == *.tar.gz.gpg ]]; then
        TMP=\$(mktemp -d)
        gpg --decrypt \"\$MINIO_DIR\" | tar xzf - -C \"\$TMP\"
        mc mirror --remove \"\$TMP\" local/pia-attachments
        rm -rf \"\$TMP\"
    elif [[ \"\$MINIO_DIR\" == *.tar.gz ]]; then
        TMP=\$(mktemp -d)
        tar xzf \"\$MINIO_DIR\" -C \"\$TMP\"
        mc mirror --remove \"\$TMP\" local/pia-attachments
        rm -rf \"\$TMP\"
    else
        mc mirror --remove \"\$MINIO_DIR\" local/pia-attachments
    fi
"

# Bring the app back
docker compose -f docker-compose.yml start backend
echo "Restore complete. Verify via the smoke checklist in docs/deployment.md § 6."
