#!/usr/bin/env bash
# Re-apply changed files INTO the current release in place — no new release number.
# For quick config fixes (nginx, compose, env-independent tweaks).
#   /opt/pia/scripts/overwrite-current.sh [path-to-files.tgz]
# Defaults to $TMP/overwrite.files.tgz.
source "$(dirname "$0")/_lib.sh"

require_root
[ -L "$CURRENT" ] || die "No current release."

files_tar="${1:-$TMP/overwrite.files.tgz}"
[ -f "$files_tar" ] || die "Missing delta bundle: $files_tar"

target="$(readlink -f "$CURRENT")"
log "Overwriting current release in place: $(basename "$target")"
tar -xz --unlink-first -f "$files_tar" -C "$target"

find "$target" -type d -exec chmod 755 {} +
find "$target" -type f -exec chmod 644 {} +
chmod +x "$target"/postgres/init/*.sh 2>/dev/null || true

"$ROOT/scripts/start.sh"
ok "Overwrite complete (still $(current_release))."
