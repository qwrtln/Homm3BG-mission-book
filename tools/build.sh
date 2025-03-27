#!/usr/bin/env bash

# Default values
LANGUAGE="en"
DRAFTS_MODE=0

# Valid language codes
valid_languages=("en" "pl" "fr" "cs")

# Function to print usage information
usage() {
  echo "Usage: $0 [language] [-p|--printable] [-n|--no-bg] [-d|--drafts]"
  echo "Example: $0 fr --printable --no-bg"
  echo
  echo "Positional arguments:"
  echo "  language           Language code (${valid_languages[*]})"
  echo "                     Defaults to 'en' if not specified"
  echo "                     (Incompatible with --drafts)"
  echo
  echo "Options:"
  echo "  -p, --printable    Enable printable mode"
  echo "  -n, --no-bg        Disable background"
  echo "  -d, --drafts       Generate draft scenarios"
  exit 1
}

# Function to check if language is valid
is_valid_language() {
  local lang="$1"
  for valid_lang in "${valid_languages[@]}"; do
    if [[ "$lang" = "$valid_lang" ]]; then
      return 0
    fi
  done
  return 1
}

# Check for OS type for the open command
case "$(uname -s)" in
  Darwin*)    open=open;;
  Linux*)     open=xdg-open;;
  MINGW*|MSYS*|CYGWIN*)    open=start;;
esac

# Check if first argument is a language code
if [[ $1 =~ ^[a-z]{2}$ ]]; then
  if is_valid_language "$1"; then
    LANGUAGE="$1"
    shift
  else
    echo "Error: Invalid language code '$1'. Valid codes are: ${valid_languages[*]}" >&2
    exit 1
  fi
fi

# Parse remaining command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -p|--printable)
        export HOMM3_PRINTABLE=1
        shift
        ;;
    -n|--no-bg)
        export HOMM3_NO_ART_BACKGROUND=1
        shift
        ;;
    -d|--drafts)
        DRAFTS_MODE=1
        shift
        ;;
    -h|--help)
        usage
        ;;
    -*)
        echo "Error: Unknown option $1" >&2
        usage
        ;;
    *)
        echo "Error: Unexpected argument '$1'" >&2
        usage
        ;;
  esac
done

# Check if language is specified with drafts mode
if [[ "${DRAFTS_MODE}" -eq 1 && "${LANGUAGE}" != "en" ]]; then
  echo "Error: Language selection is incompatible with drafts mode" >&2
  exit 1
fi

# Handle drafts mode
if [[ "${DRAFTS_MODE}" -eq 1 ]]; then
  cleanup() {
    if [[ -n "$original_dir" ]]; then
      # Windows-specific cleanup
      cd "$original_dir"
      git restore draft-scenarios/assets draft-scenarios/latexmkrc
    fi

    if [[ "${HOMM3_NO_ART_BACKGROUND}" -eq 1 ]]; then
      git restore assets/maps &> /dev/null || git restore ../assets/maps
    fi
  }
  trap cleanup EXIT

  # For Windows only - replace symlink with a copy
  if [[ "$(uname -s)" =~ ^(MINGW|MSYS|CYGWIN) ]]; then
      echo "Windows detected, handling symlinks."
      original_dir=$(pwd)
      rm "draft-scenarios/assets"
      cp -r "assets" "draft-scenarios/assets"
      cp "latexmkrc" "draft-scenarios/latexmkrc"
  fi

  if [[ "${HOMM3_NO_ART_BACKGROUND}" -eq 1 ]]; then
    find draft-scenarios -name "*tex" -exec grep -Po "maps[^}]*\.png" '{}' \; | while IFS= read -r IMG; do
      IMG="assets/${IMG}"
      echo "Converting $IMG to monochrome..."
      tools/to_monochrome.sh "${IMG}"
    done
  fi
  cd draft-scenarios || exit
  rm -f drafts.aux && \
    latexmk -pdflua -shell-escape drafts.tex
  ${open} drafts.pdf &> /dev/null &
  exit 0
fi

if [[ ${LANGUAGE} != en ]]; then
  if ! po4a --no-update po4a.cfg | grep "/${LANGUAGE}/"; then
    echo -e "---\npo4a failed for language ${LANGUAGE}, please fix the errors."
    find translations -name "$LANGUAGE.po" -type f -exec msgfmt -c --check-format -o /dev/null '{}' \;
    exit 1
  fi
fi

if [[ "${HOMM3_NO_ART_BACKGROUND}" -eq 1 ]]; then
  trap 'git restore assets/maps' EXIT
  find . -type f -name "*tex" -not -regex ".*/\(draft-scenarios\|translated\|svg-inkscape\|templates\)/.*" \
    -exec grep -Po "maps[^}]*\.png" '{}' \; | while IFS= read -r IMG; do
    IMG="assets/${IMG}"
    echo "Converting $IMG to monochrome..."
    tools/to_monochrome.sh "${IMG}"
  done
fi

# rm triggers latexmk build even if previous artifacts generated by faulty run of po4a prevent it from running
rm -f "main_${LANGUAGE}.aux" && \
  latexmk -pdflua -shell-escape "main_${LANGUAGE}.tex"
${open} "main_${LANGUAGE}.pdf" &> /dev/null &
