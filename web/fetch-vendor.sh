#!/usr/bin/env bash
# Fetches pdf.js, CodeMirror 5 and client-zip into web/app/vendor/<lib>/, the
# browser libraries the scenario builder loads by plain <script>/<link> tag
# or by URL import, with no bundler. Versions are pinned in web/vendor.env
# (CODEMIRROR_VERSION, PDFJS_VERSION, CLIENT_ZIP_VERSION) alongside a content
# hash for each (CODEMIRROR_SHA256, PDFJS_SHA256, CLIENT_ZIP_SHA256).
#
# Each library is downloaded into a temporary directory beside its
# destination, hashed as a whole (see hash_dir below) and swapped into place
# only once that hash matches the pin. A stamp file
# web/app/vendor/<lib>/.version then holds "<VERSION> <SHA256>"; a second run
# with an unchanged pin finds a matching stamp, fetches nothing over the
# network and prints nothing. A hash mismatch prints the library name and
# both hashes, exits non-zero, and leaves the previous library and stamp
# untouched — re-pinning after a version bump is "run, copy the printed
# actual hash".
#
# Needs curl, tar and sha256sum. Nothing is installed.
#
# Usage: web/fetch-vendor.sh    (no arguments)

set -euo pipefail

web=$(cd "$(dirname "$0")" && pwd)

# shellcheck source=web/vendor.env
source "$web/vendor.env"

vendor="$web/app/vendor"

# A failed or interrupted run leaves no temporary directory behind.
trap 'rm -rf "$vendor"/.*.tmp' EXIT

# Every file fetch-vendor.sh writes, as "<lib>/<path under web/app/vendor/>".
# Literal so the license test (web/tests/unit/about-licenses.test.mjs) can
# read this script and know which files are fetched rather than committed.
pdfjs_files=(
  "pdfjs/pdf.min.mjs"
  "pdfjs/pdf.worker.min.mjs"
  "pdfjs/LICENSE"
)

codemirror_files=(
  "codemirror/codemirror.min.js"
  "codemirror/codemirror.min.css"
  "codemirror/mode/stex/stex.min.js"
  "codemirror/addon/search/searchcursor.min.js"
  "codemirror/addon/search/search.min.js"
  "codemirror/addon/dialog/dialog.min.js"
  "codemirror/addon/dialog/dialog.min.css"
  "codemirror/addon/comment/comment.min.js"
  "codemirror/theme/material-darker.min.css"
  "codemirror/LICENSE"
)

client_zip_files=(
  "client-zip/index.js"
  "client-zip/LICENSE.txt"
)

# The content hash of a fetched library directory: the SHA-256 of a sorted,
# C-locale sha256sum listing of its files (excluding the stamp itself), with
# ./-relative names.
hash_dir() {
  (cd "$1" && find . -type f ! -name .version | LC_ALL=C sort | xargs sha256sum) | sha256sum | cut -d' ' -f1
}

# Downloads one file with curl, failing loudly with the library and URL on
# any error.
# $1 = library name, $2 = URL, $3 = destination path.
fetch_file() {
  local lib=$1 url=$2 dest=$3
  mkdir -p "$(dirname "$dest")"
  curl -fsSL "$url" -o "$dest" || {
    echo "fetch-vendor: failed to fetch $lib from $url" >&2
    exit 1
  }
}

# Populates $1 (a temporary directory) with pdf.js: the two .min.mjs files
# and LICENSE out of the pdfjs-dist npm tarball.
fetch_pdfjs() {
  local tmp=$1 version=$2
  local tarball="$tmp/pdfjs-dist.tgz"
  fetch_file pdfjs "https://registry.npmjs.org/pdfjs-dist/-/pdfjs-dist-${version}.tgz" "$tarball"
  local path
  for path in "${pdfjs_files[@]}"; do
    path=${path#pdfjs/}
    [[ "$path" == "LICENSE" ]] && continue
    tar xzf "$tarball" -C "$tmp" --strip-components=2 "package/build/$path"
  done
  tar xzf "$tarball" -C "$tmp" --strip-components=1 package/LICENSE
  rm -f "$tarball"
}

# Populates $1 (a temporary directory) with CodeMirror 5: the nine .min
# paths from cdnjs, plus LICENSE out of the codemirror npm tarball.
fetch_codemirror() {
  local tmp=$1 version=$2
  local path
  for path in "${codemirror_files[@]}"; do
    path=${path#codemirror/}
    [[ "$path" == "LICENSE" ]] && continue
    fetch_file codemirror "https://cdnjs.cloudflare.com/ajax/libs/codemirror/${version}/${path}" "$tmp/$path"
  done
  local tarball="$tmp/codemirror.tgz"
  fetch_file codemirror "https://registry.npmjs.org/codemirror/-/codemirror-${version}.tgz" "$tarball"
  tar xzf "$tarball" -C "$tmp" --strip-components=1 package/LICENSE
  rm -f "$tarball"
}

# Populates $1 (a temporary directory) with client-zip: index.js and
# LICENSE.txt out of the client-zip npm tarball, unchanged.
fetch_client_zip() {
  local tmp=$1 version=$2
  local tarball="$tmp/client-zip.tgz"
  fetch_file client-zip "https://registry.npmjs.org/client-zip/-/client-zip-${version}.tgz" "$tarball"
  tar xzf "$tarball" -C "$tmp" --strip-components=1 package/index.js package/LICENSE.txt
  rm -f "$tarball"
}

# Fetches one library into a temporary directory, verifies its hash against
# the pin, then atomically swaps it into place and writes the stamp. Skips
# entirely when the existing stamp already matches.
# $1 = library name, $2 = pinned version, $3 = pinned sha256, $4 = fetch
# function populating a temporary directory with the library's files.
fetch_lib() {
  local lib=$1 version=$2 sha256=$3 fetch_fn=$4
  local dest="$vendor/$lib"
  local stamp="$dest/.version"

  if [[ "$(cat "$stamp" 2>/dev/null || true)" == "$version $sha256" ]]; then
    return
  fi

  local tmp="$vendor/.$lib.tmp"
  rm -rf "$tmp"
  mkdir -p "$tmp"

  "$fetch_fn" "$tmp" "$version"

  local actual
  actual=$(hash_dir "$tmp")
  if [[ "$actual" != "$sha256" ]]; then
    echo "fetch-vendor: $lib hash mismatch: expected $sha256, got $actual" >&2
    exit 1
  fi

  rm -rf "$dest"
  mv "$tmp" "$dest"
  echo "$version $actual" > "$dest/.version"

  echo "fetched $lib $version"
}

fetch_lib pdfjs "$PDFJS_VERSION" "$PDFJS_SHA256" fetch_pdfjs
fetch_lib codemirror "$CODEMIRROR_VERSION" "$CODEMIRROR_SHA256" fetch_codemirror
fetch_lib client-zip "$CLIENT_ZIP_VERSION" "$CLIENT_ZIP_SHA256" fetch_client_zip
