#!/usr/bin/env bash
# Shared helpers for the PIA VM deployment scripts. Source this at the top of each:
#   source "$(dirname "$0")/_lib.sh"
#
# Conventions:
#   ROOT      = /opt/pia (override with PIA_ROOT for testing)
#   current   -> releases/release-NNN (active release)
#   shared/   = secrets + certs (never overwritten by a deploy)
set -euo pipefail

# ROOT auto-detects from where the scripts live (…/scripts/_lib.sh → parent dir), so
# the same scripts serve prod (/opt/pia, rootful) and dev (/opt/piadev, rootless under
# the piadev user) without any env var. PIA_ROOT still overrides for testing.
_SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${PIA_ROOT:-$(dirname "$_SCRIPTS_DIR")}"
RELEASES="$ROOT/releases"
CURRENT="$ROOT/current"
SHARED="$ROOT/shared"
IMAGES="$ROOT/images"
TMP="$ROOT/tmp"
LOGS="$ROOT/logs"
HISTORY="$RELEASES/.history"          # newline list of release numbers, newest last
ENV_FILE="$SHARED/.env"

NETWORK="pia"
SUBNET="10.90.0.0/24"
GATEWAY="10.90.0.1"
APP_IMAGE="localhost/pia/backend"      # fully-qualified app image (gotcha #2)

# Container-name prefix (pia-postgres vs piadev-postgres). Read straight from the
# .env so even scripts that never call load_env (status.sh) resolve it correctly.
PREFIX="$(grep -E '^PIA_PREFIX=' "$ENV_FILE" 2>/dev/null | head -n1 | cut -d= -f2 | tr -d '\r' || true)"
PREFIX="${PREFIX:-pia}"

# Prod (/opt/pia) must run rootful; any other root (e.g. /opt/piadev) runs rootless
# as its owning user, where being root would silently target the WRONG podman store.
require_root() {
  if [ "$ROOT" = "/opt/pia" ]; then
    [ "$(id -u)" -eq 0 ] || die "Prod ($ROOT) requires root: sudo $0 $*"
  elif [ "$(id -u)" -eq 0 ]; then
    warn "Running $ROOT as root — containers land in ROOT's podman, not the dev user's. Ctrl-C now if unintended."
  fi
}

log()  { printf '\033[0;36m[pia %s]\033[0m %s\n' "$(date +%H:%M:%S)" "$*"; }
ok()   { printf '\033[0;32m[pia ✓]\033[0m %s\n' "$*"; }
warn() { printf '\033[0;33m[pia !]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[0;31m[pia ✗]\033[0m %s\n' "$*" >&2; exit 1; }

# podman-compose (python) OR the built-in `podman compose` — whichever exists.
compose() {
  if command -v podman-compose >/dev/null 2>&1; then
    podman-compose "$@"
  else
    podman compose "$@"
  fi
}

# Load and export the shared .env for variable substitution. Scrubs CR and stray
# control chars first (gotcha #10) into a temp copy so the original is untouched.
load_env() {
  [ -f "$ENV_FILE" ] || die "Missing $ENV_FILE — copy .env.production.example and fill it in."
  local clean="$TMP/.env.clean"
  mkdir -p "$TMP"
  tr -d '\r\032' < "$ENV_FILE" | grep -vE '^\s*#' | grep -vE '^\s*$' > "$clean"
  set -a; # shellcheck disable=SC1090
  . "$clean"; set +a
}

# Which existing network (if any) already holds our subnet? Greps the raw inspect
# JSON for the subnet string so it works regardless of podman's inspect key layout.
subnet_holder() {
  local n
  for n in $(podman network ls --format '{{.Name}}' 2>/dev/null); do
    if podman network inspect "$n" 2>/dev/null | grep -q "$SUBNET"; then
      echo "$n"; return 0
    fi
  done
  return 1
}

# Ensure the `pia` network exists on our subnet. Idempotent AND collision-aware:
# if the network `pia` already exists we do nothing; if a LEFTOVER pia network from
# an earlier attempt squats our subnet under a different name (e.g. pia-tracker_pia),
# we remove ONLY that pia network and recreate. Anything that is not a pia network
# (crs, the default `podman` net, …) is never touched — we fail loudly instead.
ensure_network() {
  if podman network exists "$NETWORK"; then
    ok "Network $NETWORK exists."
    return 0
  fi
  log "Creating network $NETWORK ($SUBNET gw $GATEWAY)…"
  local err="$TMP/.net.err"; mkdir -p "$TMP"
  if podman network create --subnet "$SUBNET" --gateway "$GATEWAY" "$NETWORK" 2>"$err"; then
    return 0
  fi
  # Create failed. If it's a subnet collision, find the squatter and recover.
  local holder; holder="$(subnet_holder || true)"
  case "$holder" in
    ""|"$NETWORK")
      cat "$err" >&2
      die "Could not create network $NETWORK (see error above)." ;;
    pia_pia|pia-tracker_pia|*_pia)
      warn "Subnet $SUBNET is held by leftover PIA network '$holder' — removing it (never touches crs)."
      podman network rm -f "$holder" >/dev/null 2>&1 \
        || die "Failed to remove leftover network '$holder'. Remove it manually: podman network rm -f $holder"
      podman network create --subnet "$SUBNET" --gateway "$GATEWAY" "$NETWORK" ;;
    *)
      cat "$err" >&2
      die "Subnet $SUBNET is used by network '$holder', which is NOT a PIA network — refusing to remove it. Resolve the conflict manually." ;;
  esac
}

current_release() { [ -L "$CURRENT" ] && basename "$(readlink -f "$CURRENT")" || echo ""; }
previous_release() { [ -f "$HISTORY" ] && tail -n 2 "$HISTORY" | head -n 1 || echo ""; }

# Atomically point `current` at a release dir. Uses ln→temp + `mv -T` (rename(2)) so
# an existing symlink-to-dir is REPLACED, never descended into — atomic, no window.
swap_current() {
  local target="$1"
  ln -sfn "$target" "$CURRENT.tmp"
  mv -Tf "$CURRENT.tmp" "$CURRENT"
}
