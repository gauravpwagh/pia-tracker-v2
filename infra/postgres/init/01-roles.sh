#!/usr/bin/env bash
# Runs once on first container start (docker-entrypoint-initdb.d).
# Creates the application roles used by Flyway (migrator) and Spring Boot (app).
set -euo pipefail

MIGRATOR_USER="${POSTGRES_MIGRATOR_USER:-pia_migrator}"
MIGRATOR_PASS="${POSTGRES_MIGRATOR_PASSWORD:-pia_migrator}"
APP_USER="${POSTGRES_APP_USER:-pia_app}"
APP_PASS="${POSTGRES_APP_PASSWORD:-pia_app}"
DB="${POSTGRES_DB:-pia}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$DB" <<-EOSQL
    CREATE USER ${MIGRATOR_USER} WITH PASSWORD '${MIGRATOR_PASS}';
    CREATE USER ${APP_USER} WITH PASSWORD '${APP_PASS}';

    -- Migrator owns schema changes
    GRANT ALL PRIVILEGES ON DATABASE ${DB} TO ${MIGRATOR_USER};
    ALTER DATABASE ${DB} OWNER TO ${MIGRATOR_USER};
    GRANT CREATE ON SCHEMA public TO ${MIGRATOR_USER};

    -- App user gets DML on all future objects created by the migrator
    GRANT CONNECT ON DATABASE ${DB} TO ${APP_USER};
    ALTER DEFAULT PRIVILEGES FOR ROLE ${MIGRATOR_USER} IN SCHEMA public
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${APP_USER};
    ALTER DEFAULT PRIVILEGES FOR ROLE ${MIGRATOR_USER} IN SCHEMA public
        GRANT USAGE, SELECT ON SEQUENCES TO ${APP_USER};
EOSQL

echo "Roles ${MIGRATOR_USER} and ${APP_USER} created."
