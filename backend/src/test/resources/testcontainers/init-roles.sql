-- Testcontainers-only counterpart to infra/postgres/init/01-roles.sh.
--
-- The real docker-compose Postgres service creates pia_migrator/pia_app via
-- a docker-entrypoint-initdb.d script, which the bare Testcontainers
-- postgres:16-alpine image never runs. Several Flyway migrations
-- (V023/V025/V027/V087) GRANT privileges to pia_app, so without this the
-- Flyway migration step fails on every single integration test with
-- "role pia_app does not exist" before any test body executes.
--
-- Loaded via PostgreSQLContainer.withInitScript(...) — runs once per
-- container, before Spring Boot's datasource (and therefore Flyway) connects.
-- The app itself still connects as the container's default superuser
-- (Testcontainers' "test"/"test"), never as pia_app — these roles exist
-- purely as GRANT targets so the migrations succeed.

CREATE ROLE pia_migrator WITH LOGIN PASSWORD 'pia_migrator';
CREATE ROLE pia_app WITH LOGIN PASSWORD 'pia_app';
