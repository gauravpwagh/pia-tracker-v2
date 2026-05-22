#!/bin/bash
# PIA Tracker — Backup drill
#
# Proves that a pg_dump taken from the running stack can be fully restored
# to a fresh PostgreSQL schema and that expected reference data is present.
#
# Usage:
#   ./infra/scripts/backup-drill.sh
#
# Prerequisites:
#   - Docker Compose stack must be running: make up
#   - The pgbackup sidecar container must be healthy
#
# What it does:
#   1. Takes a fresh pg_dump (custom format, gzip) via the pgbackup sidecar.
#   2. Spins up a temporary postgres:16-alpine container.
#   3. Restores the dump into the temporary container.
#   4. Verifies data integrity: zones, activity_types, permissions rows present.
#   5. Tears down the temporary container.
#
# Exit code 0 = drill passed.
# Exit code non-zero = drill failed; check output above.

set -euo pipefail

cd "$(dirname "$0")/../.."

# ── Configuration ─────────────────────────────────────────────────────────────
DRILL_CONTAINER="pia-drill-postgres-$$"
DRILL_DB="pia_drill"
DRILL_USER="pia_drill"
DRILL_PASSWORD="drill_secret_$(date +%s)"
STAMP=$(date +%Y%m%d-%H%M%S)
DUMP_FILE="/tmp/pia-drill-${STAMP}.dump.gz"

# ── Helpers ───────────────────────────────────────────────────────────────────
info()  { echo "[drill] $*"; }
ok()    { echo "[drill] ✓ $*"; }
fail()  { echo "[drill] ✗ $*" >&2; exit 1; }

cleanup() {
    info "Cleaning up drill container..."
    docker rm -f "${DRILL_CONTAINER}" 2>/dev/null || true
    rm -f "${DUMP_FILE}"
    info "Cleanup done."
}
trap cleanup EXIT

# ── Step 1: pg_dump via pgbackup sidecar ──────────────────────────────────────
info "Step 1: taking pg_dump via pgbackup sidecar..."

# The pgbackup sidecar has PGPASSWORD, POSTGRES_HOST, POSTGRES_USER, POSTGRES_DB
# injected via docker-compose.yml environment.
docker compose -f infra/docker-compose.yml exec -T pgbackup sh -c "
    PGPASSWORD=\$POSTGRES_PASSWORD pg_dump \
        -h \$POSTGRES_HOST \
        -U \$POSTGRES_USER \
        -d \$POSTGRES_DB \
        --format=custom \
        --no-owner \
        --no-acl \
    | gzip
" > "${DUMP_FILE}"

DUMP_SIZE=$(du -sh "${DUMP_FILE}" | cut -f1)
ok "Dump written to ${DUMP_FILE} (${DUMP_SIZE})"

# ── Step 2: spin up a clean postgres container ────────────────────────────────
info "Step 2: starting temporary postgres:16-alpine container..."

docker run -d \
    --name "${DRILL_CONTAINER}" \
    -e "POSTGRES_DB=${DRILL_DB}" \
    -e "POSTGRES_USER=${DRILL_USER}" \
    -e "POSTGRES_PASSWORD=${DRILL_PASSWORD}" \
    postgres:16-alpine \
    >/dev/null

# Wait for postgres to be ready (max 30s)
info "Waiting for drill container to be ready..."
for i in $(seq 1 30); do
    if docker exec "${DRILL_CONTAINER}" \
            pg_isready -U "${DRILL_USER}" -d "${DRILL_DB}" >/dev/null 2>&1; then
        break
    fi
    if [ "${i}" -eq 30 ]; then
        fail "Drill container did not become ready within 30 seconds."
    fi
    sleep 1
done
ok "Drill container is ready."

# ── Step 3: restore the dump ──────────────────────────────────────────────────
info "Step 3: restoring dump into ${DRILL_DB}..."

# Copy the dump into the container, then restore.
# pg_restore --clean --if-exists removes objects before recreating them,
# which is harmless on a fresh DB but mirrors what restore.sh does in production.
docker cp "${DUMP_FILE}" "${DRILL_CONTAINER}:/tmp/restore.dump.gz"

docker exec -e "PGPASSWORD=${DRILL_PASSWORD}" "${DRILL_CONTAINER}" sh -c "
    gunzip -c /tmp/restore.dump.gz | pg_restore \
        -U ${DRILL_USER} \
        -d ${DRILL_DB} \
        --clean \
        --if-exists \
        --no-owner \
        --no-acl \
        --exit-on-error
"
ok "Restore complete."

# ── Step 4: data integrity assertions ─────────────────────────────────────────
info "Step 4: verifying data integrity..."

psql_drill() {
    docker exec -e "PGPASSWORD=${DRILL_PASSWORD}" "${DRILL_CONTAINER}" \
        psql -U "${DRILL_USER}" -d "${DRILL_DB}" -t -A -c "$1"
}

# 4a. Zones: NR, WR, SCR must be present (seeded in V001_001)
ZONE_COUNT=$(psql_drill "SELECT COUNT(*) FROM zones WHERE code IN ('NR','WR','SCR')")
if [ "${ZONE_COUNT}" -lt 3 ]; then
    fail "Expected ≥ 3 railway zones (NR, WR, SCR); found ${ZONE_COUNT}."
fi
ok "Zones verified: ${ZONE_COUNT} of NR/WR/SCR present."

# 4b. Activity types: all 6 standard PIA types must be present (seeded in V003_001)
AT_COUNT=$(psql_drill "SELECT COUNT(*) FROM activity_types WHERE is_active = true")
if [ "${AT_COUNT}" -lt 6 ]; then
    fail "Expected ≥ 6 active activity_types; found ${AT_COUNT}."
fi
ok "Activity types verified: ${AT_COUNT} active."

# 4c. Permissions: at least 30 permission codes (seeded in V001_005)
PERM_COUNT=$(psql_drill "SELECT COUNT(*) FROM permissions")
if [ "${PERM_COUNT}" -lt 30 ]; then
    fail "Expected ≥ 30 permissions; found ${PERM_COUNT}."
fi
ok "Permissions verified: ${PERM_COUNT} rows."

# 4d. Workflow definitions: RECORD_STANDARD_V1 and SECTION_STANDARD_V1 present
WF_COUNT=$(psql_drill "SELECT COUNT(*) FROM workflow_definitions WHERE code IN ('RECORD_STANDARD_V1','SECTION_STANDARD_V1','PROJECT_LIFECYCLE_V1')")
if [ "${WF_COUNT}" -lt 3 ]; then
    fail "Expected 3 core workflow definitions; found ${WF_COUNT}."
fi
ok "Workflow definitions verified: ${WF_COUNT} present."

# 4e. Audit log partitions exist
AUDIT_PART=$(psql_drill "SELECT COUNT(*) FROM pg_class WHERE relname LIKE 'audit_log_%' AND relkind = 'r'")
if [ "${AUDIT_PART}" -lt 1 ]; then
    fail "Expected at least one audit_log partition table; found ${AUDIT_PART}."
fi
ok "Audit log partitions verified: ${AUDIT_PART} present."

# 4f. Demo users: the 6 core demo users from V001_004 must be present
USER_COUNT=$(psql_drill "SELECT COUNT(*) FROM users WHERE employee_id IN ('EMP001','EMP002','EMP003','EMP004','EMP005','EMP006')")
if [ "${USER_COUNT}" -lt 6 ]; then
    fail "Expected 6 demo users; found ${USER_COUNT}."
fi
ok "Demo users verified: ${USER_COUNT} present."

# ── Step 5: summarise ─────────────────────────────────────────────────────────
echo ""
echo "╔════════════════════════════════════════╗"
echo "║  Backup drill PASSED  ✓               ║"
echo "╚════════════════════════════════════════╝"
echo ""
echo "Dump file:    ${DUMP_FILE} (${DUMP_SIZE})"
echo "Drill DB:     ${DRILL_DB} on ${DRILL_CONTAINER}"
echo "Timestamp:    ${STAMP}"
echo ""
echo "All integrity assertions passed.  The restore procedure is verified."
