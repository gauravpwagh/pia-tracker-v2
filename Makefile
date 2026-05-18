# PIA Tracker — developer task runner
# All targets are documented; run `make help` for the list.

# On Windows: run make from a Git Bash terminal, not PowerShell or cmd.
# Git Bash provides /bin/bash and POSIX tools (mkdir, grep, etc.) that recipes use.
SHELL := /bin/bash
.SHELLFLAGS := -ec

# Detect Windows for targets that need different system commands.
ifeq ($(OS),Windows_NT)
    IS_WINDOWS := true
else
    IS_WINDOWS :=
endif

.DEFAULT_GOAL := help

# Detect docker compose v2 (preferred) vs v1
DOCKER_COMPOSE := $(shell command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1 && echo "docker compose" || echo "docker-compose")
COMPOSE_FILES := -f infra/docker-compose.yml
COMPOSE := $(DOCKER_COMPOSE) $(COMPOSE_FILES)

# Colors
GREEN := \033[0;32m
YELLOW := \033[0;33m
RED := \033[0;31m
NC := \033[0m

.PHONY: help
help: ## Show this help
	@echo "PIA Tracker — make targets"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-20s$(NC) %s\n", $$1, $$2}'

# ─── Setup ───────────────────────────────────────────────────────────────────

.PHONY: setup
setup: check-prereqs install-certs install-hosts copy-env build-images db-up migrate seed up wait-ready open ## First-time setup (10-12 min)
	@echo ""
	@echo "$(GREEN)✓ Setup complete. https://pia.local is up.$(NC)"

.PHONY: check-prereqs
check-prereqs: ## Verify required tools are installed
	@command -v docker >/dev/null 2>&1 || { echo "$(RED)docker not found. Install Docker first.$(NC)"; exit 1; }
	@command -v mkcert >/dev/null 2>&1 || { echo "$(RED)mkcert not found. brew install mkcert or equivalent.$(NC)"; exit 1; }
	@command -v node >/dev/null 2>&1 || { echo "$(RED)node not found. Install Node 20+.$(NC)"; exit 1; }
	@command -v java >/dev/null 2>&1 || { echo "$(RED)java not found. Install JDK 21+.$(NC)"; exit 1; }
	@echo "$(GREEN)✓ Prereqs OK$(NC)"

.PHONY: install-certs
install-certs: ## Generate local TLS certs via mkcert
	@mkdir -p infra/nginx/certs
ifdef IS_WINDOWS
	@JAVA_HOME="" CAROOT="$$(mkcert -CAROOT)" mkcert -install || true
else
	@mkcert -install
endif
	@mkcert -cert-file infra/nginx/certs/pia.local-cert.pem \
	        -key-file infra/nginx/certs/pia.local-key.pem \
	        pia.local localhost 127.0.0.1
	@echo "$(GREEN)✓ TLS certs installed$(NC)"

.PHONY: install-hosts
install-hosts: ## Add pia.local to hosts file
ifdef IS_WINDOWS
	@HOSTS=/c/Windows/System32/drivers/etc/hosts; \
	if grep -q "pia.local" "$$HOSTS" 2>/dev/null; then \
		echo "$(GREEN)✓ pia.local already in hosts$(NC)"; \
	else \
		echo "$(YELLOW)ACTION REQUIRED: Cannot write Windows hosts without admin rights.$(NC)"; \
		echo "  Open Notepad as Administrator, edit C:\\Windows\\System32\\drivers\\etc\\hosts,"; \
		echo "  and add:  127.0.0.1 pia.local"; \
		echo "  Then re-run: make setup"; \
		exit 1; \
	fi
else
	@grep -q "pia.local" /etc/hosts || { \
		echo "$(YELLOW)Adding pia.local to /etc/hosts (sudo prompt)$(NC)"; \
		echo "127.0.0.1 pia.local" | sudo tee -a /etc/hosts >/dev/null; \
	}
	@echo "$(GREEN)✓ /etc/hosts has pia.local$(NC)"
endif

.PHONY: copy-env
copy-env: ## Copy .env.example to .env if missing
	@test -f .env || cp .env.example .env
	@echo "$(GREEN)✓ .env in place$(NC)"

# ─── Day-to-day ──────────────────────────────────────────────────────────────

.PHONY: up
up: ## Bring everything up (assumes setup done)
	@$(COMPOSE) up -d
	@echo "$(GREEN)✓ Up. https://pia.local$(NC)"

.PHONY: down
down: ## Stop containers, preserve volumes
	@$(COMPOSE) down

.PHONY: reset
reset: ## DANGER: wipe all data (containers + volumes)
	@read -p "$(RED)This destroys all local data. Type 'reset' to confirm: $(NC)" answer; \
	if [ "$$answer" = "reset" ]; then \
		$(COMPOSE) down -v; \
		echo "$(YELLOW)Local data wiped. Run 'make setup' to start fresh.$(NC)"; \
	else \
		echo "Aborted."; \
	fi

.PHONY: logs
logs: ## Tail all service logs
	@$(COMPOSE) logs -f --tail=200

.PHONY: ps
ps: ## Show container status
	@$(COMPOSE) ps

# ─── Database ────────────────────────────────────────────────────────────────

.PHONY: db-up
db-up: ## Start postgres alone (for migration phase)
	@$(COMPOSE) up -d postgres
	@echo "Waiting for postgres..."
	@until $(COMPOSE) exec -T postgres pg_isready -U pia >/dev/null 2>&1; do sleep 1; done
	@echo "$(GREEN)✓ Postgres ready$(NC)"

.PHONY: migrate
migrate: db-up ## Run Flyway migrations (via Docker on internal network — postgres port is not exposed to host)
	@echo "Running Flyway migrations..."
	@docker run --rm \
		--network pia-tracker_pia \
		-v "$(CURDIR)/backend/src/main/resources/db:/flyway/sql:ro" \
		-e FLYWAY_URL="jdbc:postgresql://postgres:5432/$${POSTGRES_DB:-pia}" \
		-e FLYWAY_USER="$${POSTGRES_MIGRATOR_USER:-pia_migrator}" \
		-e FLYWAY_PASSWORD="$${POSTGRES_MIGRATOR_PASSWORD:-pia_migrator}" \
		-e FLYWAY_LOCATIONS="filesystem:/flyway/sql/migration,filesystem:/flyway/sql/data" \
		flyway/flyway:10.20.1-alpine \
		migrate
	@echo "$(GREEN)✓ Migrations applied$(NC)"

.PHONY: seed
seed: ## Seed reference + demo data (dev/local only)
	@cd backend && ./gradlew seedData

.PHONY: psql
psql: ## Open psql shell on dev DB
	@$(COMPOSE) exec postgres psql -U pia -d pia

# ─── Build ───────────────────────────────────────────────────────────────────

.PHONY: build-images
build-images: ## Build all Docker images
	@$(COMPOSE) build

.PHONY: build-prod-image
build-prod-image: ## Build production-tagged images
	@cd backend && ./gradlew bootBuildImage --imageName=pia-tracker/backend:$$(git describe --tags --abbrev=0)
	@cd frontend && docker build -t pia-tracker/frontend:$$(git describe --tags --abbrev=0) .

# ─── Test ────────────────────────────────────────────────────────────────────

.PHONY: test
test: test-backend test-frontend ## Run all tests

.PHONY: test-backend
test-backend: ## Run backend unit + integration tests
	@cd backend && ./gradlew test integrationTest

.PHONY: test-frontend
test-frontend: ## Run frontend unit + component tests
	@cd frontend && npm test

.PHONY: e2e
e2e: ## Run Playwright end-to-end tests
	@$(COMPOSE) up -d
	@cd frontend && npm run e2e

# ─── Lint / format ───────────────────────────────────────────────────────────

.PHONY: lint
lint: lint-backend lint-frontend ## Lint everything

.PHONY: lint-backend
lint-backend:
	@cd backend && ./gradlew ktlintCheck detekt

.PHONY: lint-frontend
lint-frontend:
	@cd frontend && npm run lint && npm run type-check

.PHONY: format
format: ## Auto-format everything
	@cd backend && ./gradlew ktlintFormat
	@cd frontend && npm run format

# ─── Backup / restore ────────────────────────────────────────────────────────

.PHONY: backup
backup: ## Trigger an on-demand backup
	@$(COMPOSE) exec pgbackup /usr/local/bin/backup-pg.sh
	@$(COMPOSE) exec miniobackup /usr/local/bin/backup-minio.sh
	@echo "$(GREEN)✓ Backup complete$(NC)"

.PHONY: restore
restore: ## Restore from a named snapshot: make restore SNAPSHOT=20260518
	@test -n "$(SNAPSHOT)" || { echo "$(RED)SNAPSHOT=<YYYYMMDD> required$(NC)"; exit 1; }
	@bash infra/scripts/restore.sh $(SNAPSHOT)

# ─── Misc ────────────────────────────────────────────────────────────────────

.PHONY: wait-ready
wait-ready:
	@echo "Waiting for services to become healthy..."
	@for i in $$(seq 1 60); do \
		curl -ksf https://pia.local/actuator/health/readiness >/dev/null 2>&1 && exit 0; \
		sleep 2; \
	done; \
	echo "$(RED)Services did not become ready in 2 minutes. Check 'make logs'.$(NC)"; \
	exit 1

.PHONY: open
open: ## Open https://pia.local in the default browser
	@command -v open >/dev/null 2>&1 && open https://pia.local || \
	 command -v xdg-open >/dev/null 2>&1 && xdg-open https://pia.local || \
	 echo "Open https://pia.local in your browser."
