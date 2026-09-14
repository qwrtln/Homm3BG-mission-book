#!/usr/bin/env bash
# PROTOTYPE — throwaway. Ticket 01 of the WASM scenario builder map.
#
# Downloads the TeX Live files that the book needs and that no BusyTeX data
# package ships. It runs once, by hand, and its output is committed. Nothing
# here runs in the browser and nothing here runs at build time, so the app
# still depends on no third-party host.
#
# Two packages are missing from texlive-extra:
#   nth     an ordinal number macro, loaded by metadata.tex:31
#   ccicons the Creative Commons icon font, pulled in by doclicense
#
# The files land flat in texmf/, because kpathsea searches the working
# directory of the virtual filesystem first.

set -euo pipefail
cd "$(dirname "$0")"
mkdir -p texmf
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

curl -fsSL -o texmf/nth.sty https://mirrors.ctan.org/macros/generic/misc/nth.sty

curl -fsSL -o "$work/ccicons.tds.zip" https://mirrors.ctan.org/install/fonts/ccicons.tds.zip
unzip -o -j "$work/ccicons.tds.zip" \
  'tex/latex/ccicons/*' \
  'fonts/tfm/public/ccicons/*' \
  'fonts/opentype/public/ccicons/*' \
  'fonts/type1/public/ccicons/*' \
  'fonts/enc/dvips/ccicons/*' \
  'fonts/map/dvips/ccicons/*' \
  -d texmf > /dev/null

ls -l texmf
