#!/usr/bin/env bash

# Default language to 'en' if not specified
LANGUAGE="en"
DRAFT_MODE=false
CMYK_MODE=false
CUSTOM_FILE=""
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
    *)
      # First non-option argument is treated as language (unless it's already set by a flag)
      if [[ "$LANGUAGE" == "en" && "$1" != "$LANGUAGE" ]]; then
        LANGUAGE="$1"
      fi
      shift
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

gs -o "${OUTPUT_FILE}" \
  -sDEVICE=pdfwrite \
  -dCompatibilityLevel=1.7 \
  -dPDFSETTINGS=/prepress \
  -dDetectDuplicateImages=true \
  ${ARGS} "${INPUT_FILE}"
