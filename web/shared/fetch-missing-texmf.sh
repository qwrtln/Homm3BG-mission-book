#!/usr/bin/env bash
# THROWAWAY, run once by hand. Ticket 01 of the WASM scenario builder map;
# moved here by ticket 17, alongside the texmf/ output it fills, so both the
# app and the probe fetch it from one shared location.
#
# Downloads the TeX Live files that the book needs and that no BusyTeX data
# package ships. It runs once, by hand, and its output is committed. Nothing
# here runs in the browser and nothing here runs at build time, so the app
# still depends on no third-party host.
#
# Two packages are missing from every data package:
#   nth     an ordinal number macro, loaded by metadata.tex:31
#   ccicons the Creative Commons icon font, pulled in by doclicense
#
# The files land in texmf/ctan/, listed as "ctan" lines in texmf/carried.txt.
# Run carry-texmf.mjs build afterwards: it packs them into the bundle the app
# fetches, with the files copied out of texlive-extra.

set -euo pipefail
cd "$(dirname "$0")"
mkdir -p texmf/ctan
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

curl -fsSL -o texmf/ctan/nth.sty https://mirrors.ctan.org/macros/generic/misc/nth.sty

curl -fsSL -o "$work/ccicons.tds.zip" https://mirrors.ctan.org/install/fonts/ccicons.tds.zip
unzip -o -j "$work/ccicons.tds.zip" \
  'tex/latex/ccicons/*' \
  'fonts/tfm/public/ccicons/*' \
  'fonts/opentype/public/ccicons/*' \
  'fonts/type1/public/ccicons/*' \
  'fonts/enc/dvips/ccicons/*' \
  'fonts/map/dvips/ccicons/*' \
  -d texmf/ctan > /dev/null

# Upstream leaves trailing spaces on comment lines, which the repository lint
# rejects. TeX drops trailing spaces from every input line, so this is inert.
sed -i 's/[[:space:]]*$//' texmf/ctan/*.sty

ls -l texmf/ctan
