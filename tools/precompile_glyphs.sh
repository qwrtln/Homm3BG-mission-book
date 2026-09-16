#!/usr/bin/env bash

# Precompiles every glyph SVG in assets/glyphs into the PDF + .pdf_tex pair
# that the `svg` LaTeX package normally produces by calling Inkscape at
# build time with shell-escape. The output goes to a committed, dedicated
# directory (assets/glyphs-inkscape) instead of the gitignored svg-inkscape/
# build cache, so the WebAssembly build can load it with no local Inkscape
# and no shell-escape.
#
# Run this whenever a file under assets/glyphs/ changes, then commit the
# regenerated output in assets/glyphs-inkscape/.

set -euo pipefail

GLYPH_DIR="assets/glyphs"
OUT_DIR="assets/glyphs-inkscape"

if ! command -v inkscape &> /dev/null; then
  echo "Error: inkscape is not installed or not on PATH" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

count=0
names=()
for svg in "$GLYPH_DIR"/*.svg; do
  name="$(basename "$svg" .svg)"
  out_pdf="$OUT_DIR/${name}_svg-tex.pdf"

  inkscape \
    --export-type=pdf \
    --export-latex \
    --export-filename="$out_pdf" \
    "$svg"

  names+=("\"$name\"")
  count=$((count + 1))
done

# A manifest of glyph basenames, because the browser has no directory
# listing: it needs to know every filename before it can fetch them.
{
  echo "["
  printf '  %s,\n' "${names[@]::${#names[@]}-1}"
  printf '  %s\n' "${names[-1]}"
  echo "]"
} > "$OUT_DIR/manifest.json"

echo "Precompiled $count glyphs into $OUT_DIR"
