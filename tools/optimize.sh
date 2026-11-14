#!/usr/bin/env bash

source tools/.language_base.sh

DRAFT_MODE=false
CMYK_MODE=false
CUSTOM_FILE=""
BYPASS_REPAIR=false
ARGS=""

while [[ $# -gt 0 ]]; do
  case $1 in
    -d|--drafts)
      DRAFT_MODE=true
      shift
      ;;
    -f|--file)
      if [[ -n "$2" && "$2" != -* ]]; then
        CUSTOM_FILE="$2"
        shift 2
      else
        echo "Error: Argument for $1 is missing" >&2
        exit 1
      fi
      ;;
    --cmyk)
      CMYK_MODE=true
      shift
      ;;
    --bypass-repair)
      BYPASS_REPAIR=true
      shift
      ;;
    *)
      echo "Error: Unknown option $1"
      usage
      ;;
  esac
done

if [[ -n "$CUSTOM_FILE" ]]; then
  INPUT_FILE="$CUSTOM_FILE"
  OUTPUT_FILE="${CUSTOM_FILE%.*}_optimized.${CUSTOM_FILE##*.}"
elif [[ "$DRAFT_MODE" == "true" ]]; then
  INPUT_FILE="draft-scenarios/drafts.pdf"
  OUTPUT_FILE="draft-scenarios/drafts_optimized.pdf"
else
  INPUT_FILE="main_${LANGUAGE}.pdf"
  OUTPUT_FILE="main_${LANGUAGE}_optimized.pdf"
fi

if [[ "$CMYK_MODE" == "true" ]]; then
  ARGS="-sColorConversionStrategy=CMYK"
fi

# With --bypass-repair, the output is Ghostscript's file as is.
gs_file="${OUTPUT_FILE}"
if [[ "$BYPASS_REPAIR" == "false" ]]; then
  tmp_dir="$(mktemp -d)"
  trap 'rm -rf -- "$tmp_dir"' EXIT
  gs_file="${tmp_dir}/gs.pdf"
fi

gs -o "${gs_file}" \
  -sDEVICE=pdfwrite \
  -dCompatibilityLevel=1.7 \
  -dPDFSETTINGS=/prepress \
  -dDetectDuplicateImages=true \
  ${ARGS} "${INPUT_FILE}" || exit 1

if [[ "$BYPASS_REPAIR" == "true" ]]; then
  exit 0
fi

# Ghostscript breaks the text of the "ffi" and "ffl" ligatures ("difficult" reads
# "difÏcult"). Copy the right entries back from the LuaTeX original.
# The container ships pikepdf; elsewhere uv installs it.
python_runner=(python3)
if [[ -z "$HOMM3BG_CONTAINER" ]]; then
  python_runner=(uv run --with pikepdf python3)
fi
"${python_runner[@]}" tools/repair_tounicode.py "${INPUT_FILE}" "${gs_file}" "${OUTPUT_FILE}" || exit 1
