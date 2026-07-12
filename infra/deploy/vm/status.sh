#!/usr/bin/env bash
# Show what's deployed and running. Read-only. Only ever inspects pia-* containers.
#   /opt/pia/scripts/status.sh
source "$(dirname "$0")/_lib.sh"

echo "Current release : $(current_release)"
echo "Previous release: $(previous_release)"
echo "current -> $(readlink -f "$CURRENT" 2>/dev/null || echo '(none)')"
if [ -f "$IMAGES/app/backend.digest" ]; then
  echo "Backend image   : $(cat "$IMAGES/app/backend.digest")"
fi
echo
echo "Releases on disk:"
ls -1 "$RELEASES" 2>/dev/null | grep '^release-' | sed 's/^/  /' || echo "  (none)"
echo
echo "Running PIA containers:"
podman ps --filter "name=${PREFIX}-" \
  --format "  {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "  (podman unavailable)"
