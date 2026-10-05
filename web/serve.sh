#!/usr/bin/env bash
# Runs the scenario builder locally, at http://127.0.0.1:$PORT/web/app/.
#
# Fetches the BusyTeX engine into web/core/busytex/ on the first run, the same
# release the deploy fetches (BUSYTEX_ENGINE_VERSION in web/vendor.env), and
# again whenever that version changes. Also runs fetch-vendor.sh, which fetches
# CodeMirror 5 into web/app/vendor/ the same way, and npm ci when
# node_modules/ is missing. Then runs the Vite dev server (npm run dev): it
# sends the COOP/COEP headers the engine needs and serves /web/repo/ from the
# repository root and the engine files from web/. Before that, counts the
# book's glyph uses into assets/glyphs-inkscape/glyph-usage.json (gitignored)
# for the editor's \svg{} suggestions.
#
# Needs curl, tar, git, and Node and npm (the version in web/.nvmrc).
#
# Usage: web/serve.sh [PORT]    (default 8000)

set -euo pipefail

web=$(cd "$(dirname "$0")" && pwd)
port=${1:-${PORT:-8000}}

command -v node >/dev/null || { echo "Node is required: https://nodejs.org" >&2; exit 1; }
command -v npm >/dev/null || { echo "npm is required: https://nodejs.org" >&2; exit 1; }

# shellcheck source=web/vendor.env
source "$web/vendor.env"
engine="$web/core/busytex"
stamp="$engine/.version"

if [[ "$(cat "$stamp" 2>/dev/null)" != "$BUSYTEX_ENGINE_VERSION" ]]; then
  echo "Fetching the BusyTeX engine $BUSYTEX_ENGINE_VERSION (a few hundred MB, once)…"
  rm -rf "$engine"
  mkdir -p "$engine"
  url="https://github.com/TeXlyre/texlyre-busytex/releases/download/assets-v${BUSYTEX_ENGINE_VERSION}/busytex-assets.tar.gz"
  curl -fL --progress-bar "$url" | tar xz -C "$engine" --strip-components=1
  echo "$BUSYTEX_ENGINE_VERSION" > "$stamp"
fi

"$web/fetch-vendor.sh"

[[ -d "$web/node_modules" ]] || (cd "$web" && npm ci)

# How often the book uses each glyph, so the editor offers common ones first.
node "$web/glyph-usage.ts"

echo "Open http://127.0.0.1:$port/web/app/ (Ctrl+C to stop)"
cd "$web"
exec npm run dev -- --host 127.0.0.1 --port "$port" --strictPort
