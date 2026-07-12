#!/usr/bin/env bash
# Stop the whole PIA stack for this root (frees the RAM; data volumes persist).
#   /opt/piadev/scripts/stop.sh     (dev, as the piadev user)
#   sudo /opt/pia/scripts/stop.sh   (prod — normally you never stop prod by hand)
#
# Counterpart of start.sh. Uses `compose down` (stops AND removes containers —
# never volumes) with a plain `podman stop` fallback for anything left matching
# the ${PREFIX}- name prefix.
source "$(dirname "$0")/_lib.sh"

require_root

if [ -L "$CURRENT" ] && [ -d "$CURRENT" ]; then
  load_env
  cd "$CURRENT"
  log "Bringing down the ${PREFIX} stack…"
  compose -f docker-compose.production.yml down || warn "compose down reported errors — checking leftovers."
fi

# Sweep any stragglers by name prefix (also covers a broken/missing current release).
leftovers="$(podman ps --format '{{.Names}}' 2>/dev/null | grep "^${PREFIX}-" || true)"
if [ -n "$leftovers" ]; then
  log "Stopping leftover containers: $(echo "$leftovers" | tr '\n' ' ')"
  echo "$leftovers" | xargs -r podman stop
fi

ok "${PREFIX} stack stopped. Data volumes untouched — start again with start.sh."
