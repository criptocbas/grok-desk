#!/usr/bin/env bash
# Install Grok Desk as a user-local desktop app (Omarchy / Linux).
# - Binary: ~/.local/bin/grok-desk
# - Desktop entry: ~/.local/share/applications/app.grokdesk.desktop
# - Icons: ~/.local/share/icons/hicolor/...
# - Meta: ~/.local/share/grok-desk/install-meta.json
#
# Usage:
#   ./scripts/install-local.sh           # build + install current tree
#   ./scripts/install-local.sh --update  # git pull origin main, then build + install
#   ./scripts/install-local.sh --skip-build  # install already-built release binary
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PREFIX="${HOME}/.local"
BIN_DIR="${PREFIX}/bin"
SHARE="${PREFIX}/share"
APP_ID="app.grokdesk"
APP_NAME="Grok Desk"
META_DIR="${SHARE}/grok-desk"
META_FILE="${META_DIR}/install-meta.json"
DESKTOP_FILE="${SHARE}/applications/${APP_ID}.desktop"
ICON_SRC="${ROOT}/src-tauri/icons"
RELEASE_BIN="${ROOT}/src-tauri/target/release/grok-desk"

DO_UPDATE=0
SKIP_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --update) DO_UPDATE=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
  esac
done

log() { printf '→ %s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

need() { command -v "$1" >/dev/null 2>&1 || die "missing dependency: $1"; }

need npm
need cargo
need git

if [[ "$DO_UPDATE" -eq 1 ]]; then
  log "Fetching latest main…"
  git fetch origin main
  # Prefer fast-forward; if dirty tree, still try merge/rebase carefully
  if git rev-parse --abbrev-ref HEAD | grep -qx main; then
    git pull --ff-only origin main || {
      log "ff-only failed; attempting merge of origin/main"
      git merge --no-edit origin/main
    }
  else
    log "Not on main — checking out main for update"
    git checkout main
    git pull --ff-only origin main
  fi
fi

COMMIT="$(git rev-parse HEAD)"
COMMIT_SHORT="$(git rev-parse --short HEAD)"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
VERSION="$(node -p "require('./package.json').version" 2>/dev/null || echo "0.0.0")"
BUILT_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

if [[ "$SKIP_BUILD" -eq 0 ]]; then
  log "Installing npm deps…"
  if [[ -f package-lock.json ]]; then
    npm ci --no-audit --no-fund 2>/dev/null || npm install --no-audit --no-fund
  else
    npm install --no-audit --no-fund
  fi

  log "Building production app (Tauri release, no OS bundles)…"
  export GROK_DESK_GIT_COMMIT="$COMMIT"
  export GROK_DESK_GIT_COMMIT_SHORT="$COMMIT_SHORT"
  export GROK_DESK_VERSION="$VERSION"
  # --no-bundle: we only need the binary (AppImage/linuxdeploy often fails on Omarchy).
  # Embed commit into the binary via env for build.rs
  npm run tauri build -- --no-bundle
else
  log "Skipping build (--skip-build)"
  [[ -x "$RELEASE_BIN" ]] || die "no release binary at $RELEASE_BIN"
fi

[[ -x "$RELEASE_BIN" ]] || die "build finished but binary missing: $RELEASE_BIN"

log "Installing binary → ${BIN_DIR}/grok-desk"
mkdir -p "$BIN_DIR" "$META_DIR" "${SHARE}/applications"
install -Dm755 "$RELEASE_BIN" "${BIN_DIR}/grok-desk"

# Icons
for size in 32x32 128x128; do
  src="${ICON_SRC}/${size}.png"
  if [[ -f "$src" ]]; then
    dest="${SHARE}/icons/hicolor/${size}/apps/grok-desk.png"
    mkdir -p "$(dirname "$dest")"
    install -Dm644 "$src" "$dest"
  fi
done
# Also install 128 as generic
if [[ -f "${ICON_SRC}/icon.png" ]]; then
  install -Dm644 "${ICON_SRC}/icon.png" "${SHARE}/icons/hicolor/256x256/apps/grok-desk.png" 2>/dev/null || true
  install -Dm644 "${ICON_SRC}/128x128.png" "${SHARE}/pixmaps/grok-desk.png" 2>/dev/null || {
    mkdir -p "${SHARE}/pixmaps"
    install -Dm644 "${ICON_SRC}/128x128.png" "${SHARE}/pixmaps/grok-desk.png"
  }
fi

log "Writing desktop entry → ${DESKTOP_FILE}"
cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Name=${APP_NAME}
Comment=Mission control for Grok Build (desktop shell)
Exec=${BIN_DIR}/grok-desk
Icon=grok-desk
Terminal=false
Categories=Development;IDE;Utility;
Keywords=grok;ai;coding;agent;build;
StartupWMClass=grok-desk
StartupNotify=true
EOF

# Meta for in-app update checks
cat > "$META_FILE" <<EOF
{
  "version": "${VERSION}",
  "commit": "${COMMIT}",
  "commitShort": "${COMMIT_SHORT}",
  "branch": "${BRANCH}",
  "repoPath": "${ROOT}",
  "installedAt": "${BUILT_AT}",
  "binaryPath": "${BIN_DIR}/grok-desk",
  "githubRepo": "criptocbas/grok-desk",
  "githubBranch": "main"
}
EOF

# Refresh desktop database / icon cache if tools exist
if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "${SHARE}/applications" 2>/dev/null || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -f -t "${SHARE}/icons/hicolor" 2>/dev/null || true
fi

log "Installed ${APP_NAME} v${VERSION} (${COMMIT_SHORT})"
log "Launch: Super+Space → “Grok Desk”, or: grok-desk"
log "Update later: ${ROOT}/scripts/install-local.sh --update"
log "Meta: ${META_FILE}"
