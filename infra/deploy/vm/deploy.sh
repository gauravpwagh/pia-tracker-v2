#!/usr/bin/env bash
# Prepare a new release from the transferred delta bundle and switch to it.
#   /opt/pia/scripts/deploy.sh <NNN>
#
# Incremental by design (see the deployment spec):
#   - The new release dir is built by HARDLINK-copying the previous release
#     (`cp -al` — unchanged files share inodes, ~0 bytes), then extracting only the
#     changed files on top with `--unlink-first` so the previous release is never
#     mutated. Each release dir is therefore complete AND cheap.
#   - The app image tar is loaded ONLY if the PC shipped one (i.e. it changed).
#
# Expected in $TMP before running (placed there by the PC deploy step):
#   release-<NNN>.files.tgz   (required — changed project files)
#   app-image.tar             (optional — only when the backend image changed)
source "$(dirname "$0")/_lib.sh"

require_root
[ $# -ge 1 ] || die "Usage: $0 <NNN>"

# Normalise "12" or "release-012" → "release-012"
arg="$1"
if [[ "$arg" =~ ^[0-9]+$ ]]; then name="release-$(printf '%03d' "$arg")"; else name="$arg"; fi
reldir="$RELEASES/$name"
files_tar="$TMP/${name}.files.tgz"

[ -f "$files_tar" ] || die "Missing delta bundle: $files_tar (transfer it first)."
[ -d "$reldir" ] && die "$reldir already exists. Use overwrite-current.sh for in-place fixes."

prev="$(current_release)"
log "Preparing $name (previous: ${prev:-none})…"

if [ -n "$prev" ] && [ -d "$RELEASES/$prev" ]; then
  cp -al "$RELEASES/$prev" "$reldir"           # hardlink the unchanged files
else
  mkdir -p "$reldir"
fi

log "Applying changed files…"
tar -xz --unlink-first -f "$files_tar" -C "$reldir"   # --unlink-first protects prev's inodes

# ── App image (only if shipped) ───────────────────────────────────────────────────
if [ -f "$TMP/app-image.tar" ]; then
  load_env
  log "Loading app image…"
  loaded="$(podman load -i "$TMP/app-image.tar" | sed -n 's/.*Loaded image: //p' | head -n1)"
  if [ -n "$loaded" ]; then
    podman tag "$loaded" "$APP_IMAGE:${PIA_IMAGE_TAG:-prod}" 2>/dev/null || true   # gotcha #2
    ok "App image: $loaded → $APP_IMAGE:${PIA_IMAGE_TAG:-prod}"
  fi
  [ -f "$TMP/app-image.digest" ] && cp "$TMP/app-image.digest" "$IMAGES/app/backend.digest"
else
  log "No app image in bundle — backend unchanged, reusing loaded image."
fi

# ── Permissions so container UIDs can read config/init files (gotcha #9) ───────────
find "$reldir" -type d -exec chmod 755 {} +
find "$reldir" -type f -exec chmod 644 {} +
chmod +x "$reldir"/postgres/init/*.sh 2>/dev/null || true

# ── Flip the current symlink atomically, record history ───────────────────────────
swap_current "$reldir"
touch "$HISTORY"
[ "$(tail -n1 "$HISTORY" 2>/dev/null)" = "$name" ] || echo "$name" >> "$HISTORY"
ok "current → $name"

# ── Start the stack ───────────────────────────────────────────────────────────────
"$ROOT/scripts/start.sh"
ok "Deploy of $name complete."
