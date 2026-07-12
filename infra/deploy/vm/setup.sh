#!/usr/bin/env bash
# One-time VM preparation. Idempotent — safe to re-run.
#   sudo /opt/pia/scripts/setup.sh
#
# Does: create the /opt/pia layout, seed .env, load+retag BASE images once, generate
# self-signed certs if missing, create the pia network, enable ip_forward + firewalld
# rules, and install the systemd unit. Never touches the crs app.
source "$(dirname "$0")/_lib.sh"

require_root

log "Creating $ROOT layout…"
mkdir -p "$RELEASES" "$SHARED/certs" "$IMAGES/base" "$IMAGES/app" \
         "$ROOT/backup" "$LOGS" "$ROOT/scripts" "$TMP"

# ── .env ────────────────────────────────────────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
  if [ -f "$ROOT/scripts/.env.production.example" ]; then
    cp "$ROOT/scripts/.env.production.example" "$ENV_FILE"
    warn "Seeded $ENV_FILE from the example. EDIT IT before the first deploy (gotcha #3)."
  else
    warn "No $ENV_FILE and no example to seed from — create it before deploying."
  fi
else
  ok ".env already present (left untouched)."
fi

# ── Base images: load once, then retag any short names to fully-qualified (#2) ────
if [ -f "$IMAGES/base/.loaded" ]; then
  ok "Base images already loaded."
else
  shopt -s nullglob
  for tar in "$IMAGES/base"/*.tar "$IMAGES/base"/*.tar.gz; do
    log "podman load < $(basename "$tar")"
    podman load -i "$tar"
  done
  shopt -u nullglob
  touch "$IMAGES/base/.loaded"
  ok "Base images loaded."
fi

# ── Self-signed cert for the HTTPS listener (only if none provided) ───────────────
if [ ! -f "$SHARED/certs/pia.crt" ] || [ ! -f "$SHARED/certs/pia.key" ]; then
  log "Generating self-signed cert (replace with a real one in $SHARED/certs if desired)…"
  openssl req -x509 -newkey rsa:2048 -nodes -days 825 \
    -keyout "$SHARED/certs/pia.key" -out "$SHARED/certs/pia.crt" \
    -subj "/CN=pia.local" >/dev/null 2>&1 || warn "openssl not available — provide certs manually."
  chmod 600 "$SHARED/certs/pia.key" 2>/dev/null || true
fi

# ── Network (idempotent + collision-aware; cleans a leftover pia net — gotcha #11) ──
ensure_network

# ── Root-only host config: sysctl, firewalld, systemd unit ────────────────────────
# Rootless (dev) skips all of this: dev is started/stopped manually via start.sh /
# stop.sh (no boot autostart, by design), and firewall ports need one root command.
if [ "$(id -u)" -eq 0 ]; then
  log "Enabling net.ipv4.ip_forward…"
  sysctl -w net.ipv4.ip_forward=1 >/dev/null
  grep -q '^net.ipv4.ip_forward=1' /etc/sysctl.conf 2>/dev/null || echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.conf

  if command -v firewall-cmd >/dev/null 2>&1; then
    load_env
    BRIDGE="$(podman network inspect "$NETWORK" --format '{{.NetworkInterface}}' 2>/dev/null || true)"
    if [ -n "$BRIDGE" ]; then
      log "Adding bridge $BRIDGE to firewalld trusted zone…"
      firewall-cmd --permanent --zone=trusted --add-interface="$BRIDGE" >/dev/null 2>&1 || true
    fi
    for p in "${PIA_HTTP_PORT:-8453}" "${PIA_HTTPS_PORT:-8090}"; do
      log "Opening host port $p/tcp in the active firewalld zone…"
      firewall-cmd --permanent --add-port="${p}/tcp" >/dev/null 2>&1 || true
    done
    firewall-cmd --reload >/dev/null 2>&1 || true
  else
    warn "firewalld not found — open the PIA host ports manually if external access is needed."
  fi

  # systemd unit (starts current release on boot) — prod only.
  if [ "$ROOT" = "/opt/pia" ] && [ -f "$ROOT/scripts/pia.service" ]; then
    log "Installing systemd unit pia.service…"
    cp "$ROOT/scripts/pia.service" /etc/systemd/system/pia.service
    systemctl daemon-reload
    systemctl enable pia.service >/dev/null 2>&1 || true
    ok "pia.service installed and enabled."
  fi
else
  load_env
  warn "Rootless setup — skipped sysctl/firewalld/systemd (no autostart: use start.sh / stop.sh)."
  warn "One-time, as root, only if this stack must be reachable from OTHER machines:"
  warn "  firewall-cmd --permanent --add-port=${PIA_HTTP_PORT:-8455}/tcp --add-port=${PIA_HTTPS_PORT:-8092}/tcp && firewall-cmd --reload"
  warn "  loginctl enable-linger $(id -un)   # keeps containers alive after SSH logout (does NOT autostart)"
fi

ok "Setup complete. Next: ensure $ENV_FILE is correct, then run a deploy."
