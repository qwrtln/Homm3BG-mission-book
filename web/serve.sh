#!/usr/bin/env bash
# Runs the scenario builder locally, at http://127.0.0.1:$PORT/web/app/.
#
# Fetches the BusyTeX engine into web/core/busytex/ on the first run, the same
# release the deploy fetches (BUSYTEX_ENGINE_VERSION in web/vendor.env), and
# again whenever that version changes. Then serves the repository with the
# dependency-free server the tests use: it sends the COOP/COEP headers the
# engine needs and maps /web/repo/ to the repository root.
#
# Needs curl, tar and Node. Nothing is installed.
#
# Usage: web/serve.sh [PORT]    (default 8000)

set -euo pipefail

web=$(cd "$(dirname "$0")" && pwd)
port=${1:-${PORT:-8000}}

command -v node >/dev/null || { echo "Node is required: https://nodejs.org" >&2; exit 1; }

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

echo "Open http://127.0.0.1:$port/web/app/ (Ctrl+C to stop)"
PORT=$port exec node "$web/tests/driver/serve.mjs"
