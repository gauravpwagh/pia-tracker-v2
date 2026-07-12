#!/usr/bin/env bash
# Roll back to the previous release and restart. Releases are never deleted.
#   /opt/pia/scripts/rollback.sh
source "$(dirname "$0")/_lib.sh"

require_root

cur="$(current_release)"
prev="$(previous_release)"
[ -n "$prev" ] || die "No previous release recorded in $HISTORY."
[ -d "$RELEASES/$prev" ] || die "Previous release dir $RELEASES/$prev is missing."
[ "$prev" = "$cur" ] && die "Previous == current ($cur); nothing to roll back to."

log "Rolling back: $cur → $prev"
swap_current "$RELEASES/$prev"
echo "$prev" >> "$HISTORY"        # prev is now newest, so another rollback returns to $cur
ok "current → $prev"

"$ROOT/scripts/start.sh"
ok "Rollback complete."
