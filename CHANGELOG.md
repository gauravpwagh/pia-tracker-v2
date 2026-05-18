# Changelog

All notable changes to PIA Tracker are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Phase 1 — Sub-phase 1.1 (in progress)

Project skeleton and Mode 1 setup. See `docs/phasing.md` § 1.1 for the acceptance gate.

#### Added

- Repository skeleton with backend (Spring Boot), frontend (Vite + React), infra (Docker Compose), docs.
- Makefile with `setup`, `up`, `down`, `reset`, `migrate`, `seed`, `test`, `lint`, `e2e`, `logs`, `psql`, `backup`, `restore` targets.
- mkcert-based local TLS for `https://pia.local`.
- Logo SVGs (light, dark, favicon).
- Full documentation set in `docs/`: architecture, database, workflow, permissions, forms, dashboards, UI, API, security, testing, deployment, phasing.
- Root `CLAUDE.md` for project orientation; per-folder `CLAUDE.md`s for code areas.
- Lefthook pre-commit and pre-push hooks.

#### Notes

The skeleton intentionally ships before any feature work to lock the conventions. The architecture in `docs/architecture.md` is the source of truth — code should conform, not the other way around.
