#!/bin/bash
# On-demand backup — triggered by `make backup`.
# Runs pg_dump and minio mirror once, encrypts, writes to /backups.
# See docs/deployment.md § 6.

set -euo pipefail

cd "$(dirname "$0")/.."

STAMP=$(date +%Y%m%d-%H%M%S)
echo "Triggering on-demand backup at ${STAMP}"

docker compose -f docker-compose.yml exec -T pgbackup sh -c "
    PGPASSWORD=\$POSTGRES_PASSWORD pg_dump -h \$POSTGRES_HOST -U \$POSTGRES_USER -d \$POSTGRES_DB -Fc | gzip > /backups/pg/pia-${STAMP}-ondemand.dump.gz
    echo 'Postgres backup written.'
"

docker compose -f docker-compose.yml exec -T miniobackup sh -c "
    mc alias set local http://minio:9000 \$MINIO_ROOT_USER \$MINIO_ROOT_PASSWORD >/dev/null
    mc mirror local/pia-attachments /backups/minio/${STAMP}-ondemand/
    echo 'MinIO mirror complete.'
"

echo "Backup complete. Files under /backups/ on the host."
