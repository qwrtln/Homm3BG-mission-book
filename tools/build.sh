#!/usr/bin/env bash

# Default values
LANGUAGE="en"
DRAFTS_MODE=0
PRINTABLE_MODE=0
MONO_MODE=0
SCENARIO_SEARCH=""

valid_languages=("en" "pl" "fr" "cs")

usage() {
  echo "Usage: $0 [language] [-p|--printable] [-m|--mono] [-d|--drafts] [-s|--scenario SEARCH]"
  echo "Example: $0 -d --mono"
  echo
  echo "Positional arguments:"
  echo "  language           Language code (${valid_languages[*]})"
  echo "                     Defaults to 'en' if not specified"
  echo "                     (Incompatible with --drafts)"
  echo
  echo "Options:"
  echo "  -p, --printable    Enable printable mode"
  echo "  -m, --mono         Monochrome mode"
  echo "  -d, --drafts       Generate draft scenarios"
  echo "  -s, --scenario     Build a single scenario matching the input given"
  echo "  -h, --help         Show this help message"
  echo
  echo "Short options can be combined, e.g. -dm for drafts and mono"
  exit 1
}

is_valid_language() {
  local lang="$1"
  for valid_lang in "${valid_languages[@]}"; do
    if [[ "$lang" = "$valid_lang" ]]; then
      return 0
    fi
  done
  return 1
}

case "$(uname -s)" in
  Darwin*)
    open=open
    grep_cmd=ggrep
    ;;
  Linux*)
    open=xdg-open
    grep_cmd=grep
    ;;
  MINGW*|MSYS*|CYGWIN*)
    open=start
    grep_cmd=grep
    ;;
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
  arg="$1"
  shift

  # Handle long options
  if [[ $arg == --* ]]; then
    case "${arg:2}" in
      printable) PRINTABLE_MODE=1 ;;
      mono) MONO_MODE=1 ;;
      drafts) DRAFTS_MODE=1 ;;
      scenario)
        if [[ $# -lt 1 ]]; then
          echo "Error: --scenario requires a string argument" >&2
          usage
        fi
        SCENARIO_SEARCH="$1"
        shift
        ;;
      help) usage ;;
      *) echo "Error: Unknown option $arg" >&2; usage ;;
    esac
    continue
  fi

  # Handle short and combined options
  if [[ $arg == -* ]]; then
    # Special handling for -s which requires an argument
    if [[ $arg =~ s && ! $arg =~ ^-s$ ]]; then
      echo "Error: -s option must be specified separately as it requires an argument" >&2
      usage
    fi

    for (( i=1; i<${#arg}; i++ )); do
      case "${arg:$i:1}" in
        p) PRINTABLE_MODE=1 ;;
        m) MONO_MODE=1 ;;
        d) DRAFTS_MODE=1 ;;
        s)
          if [[ $# -lt 1 ]]; then
            echo "Error: -s requires a string argument" >&2
            usage
          fi
          SCENARIO_SEARCH="$1"
          shift
          ;;
        h) usage ;;
        *) echo "Error: Unknown option -${arg:$i:1}" >&2; usage ;;
      esac
    done
    continue
  fi

  echo "Error: Unexpected argument '$arg'" >&2
  usage
done

[[ $PRINTABLE_MODE -eq 1 ]] && export HOMM3_PRINTABLE=1
[[ $MONO_MODE -eq 1 ]] && export HOMM3_NO_ART_BACKGROUND=1

# Check for incompatible options
if [[ "${DRAFTS_MODE}" -eq 1 ]]; then
  if [[ "${LANGUAGE}" != "en" ]]; then
    echo "Error: Language selection is incompatible with drafts mode" >&2
    exit 1
  fi
  if [[ "${SCENARIO_SEARCH}" != "" ]]; then
    echo "Error: Scenario selection is incompatible with drafts mode" >&2
    exit 1
  fi
fi

# Mono mode cleanup to restore maps
cleanup_monochrome() {
  if [[ "${HOMM3_NO_ART_BACKGROUND}" -eq 1 ]]; then
    git restore assets/maps &> /dev/null || git restore ../assets/maps
  fi
}

# Windows-specific cleanup to handle symlinks
cleanup_windows_drafts() {
  if [[ -n "$original_dir" ]]; then
    pushd "$original_dir" || exit
    git restore draft-scenarios/assets draft-scenarios/latexmkrc draft-scenarios/metadata.tex draft-scenarios/.version
    popd || exit
  fi
}

# Single scenario cleanup to restore document structure
cleanup_scenario() {
  if [[ -n "${SCENARIO_SEARCH}" ]]; then
    git restore structure.tex
  fi
}

# Combined cleanup function for trap
cleanup() {
  cleanup_monochrome
  cleanup_windows_drafts
  cleanup_scenario
}

trap cleanup EXIT

monochrome_with_cache() {
  local img
  local cache_dir
  local basename
  local current_hash
  local cache_img
  local cache_hash
  local stored_hash

  img="$1"
  cache_dir="$2"

  basename=$(basename "${img}" .png)
  current_hash=$(md5sum "${img}" | awk '{print $1}')
  cache_img="${cache_dir}/${basename}.png"
  cache_hash="${cache_dir}/${basename}.hash"

  # Check if cached image exists and hash matches
  if [[ -f "${cache_hash}" && -f "${cache_img}" ]]; then
    stored_hash=$(cat "${cache_hash}")
    if [[ "${current_hash}" = "${stored_hash}" ]]; then
      cp "${cache_img}" "${img}"
      return
    fi
  fi

  echo "Converting $img to monochrome..."
  tools/to_monochrome.sh "${img}"
  cp "${img}" "${cache_img}"
  echo "${current_hash}" > "${cache_hash}"
}

# Handle scenario filtering, save for later use
SCENARIO=""
if [[ -n "${SCENARIO_SEARCH}" ]]; then
  if ! tools/_find_scenario.sh "${SCENARIO_SEARCH}"; then
    exit 1
  fi
  SCENARIO=$(perl -pE 's|.*/||; s|\..*||' structure.tex)
  # Handle monochrome mode for a single file
  if [[ "${HOMM3_NO_ART_BACKGROUND}" -eq 1 ]]; then
    CACHE_DIR="cache/monochrome-maps"
    mkdir -p ${CACHE_DIR}

    find . -type f -name "${SCENARIO}.tex" ! -path "*/translated/*" -exec "${grep_cmd}" -Po "maps[^}]*\.png" {} \; | while IFS= read -r IMG; do
      IMG="assets/${IMG}"
      monochrome_with_cache "${IMG}" "${CACHE_DIR}"
    done
  fi
fi

# Handle drafts
if [[ "${DRAFTS_MODE}" -eq 1 ]]; then
  # For Windows only - replace symlink with a copy
  if [[ "$(uname -s)" =~ ^(MINGW|MSYS|CYGWIN) ]]; then
      echo "Windows detected, handling symlinks."
      original_dir=$(pwd)
      rm "draft-scenarios/assets" "draft-scenarios/latexmkrc" "draft-scenarios/metadata.tex" "draft-scenarios/.version"
      cp -r "assets" "draft-scenarios/assets"
      cp "latexmkrc" "metadata.tex" ".version" "draft-scenarios/"
  fi

  # Monochromize maps if it's mono mode
  if [[ "${HOMM3_NO_ART_BACKGROUND}" -eq 1 ]]; then
    CACHE_DIR="cache/monochrome-maps"
    mkdir -p ${CACHE_DIR}

    find draft-scenarios -name "*tex" -exec "${grep_cmd}" -Po "maps[^}]*\.png" '{}' \; | while IFS= read -r IMG; do
      IMG="assets/${IMG}"
      monochrome_with_cache "${IMG}" "${CACHE_DIR}"
    done
  fi

  pushd draft-scenarios || exit
  rm -f drafts.aux && \
    latexmk -pdflua -shell-escape drafts.tex
  ${open} drafts.pdf &> /dev/null &
  popd || exit
  echo "draft-scenarios/drafts.pdf"
  exit 0
fi

# Run po4a for non-English languages
if [[ ${LANGUAGE} != en ]]; then
  if ! po4a --no-update po4a.cfg | grep "/${LANGUAGE}/"; then
    echo -e "---\npo4a failed for language ${LANGUAGE}, please fix the errors."
    find translations -name "$LANGUAGE.po" -type f -exec msgfmt -c --check-format -o /dev/null '{}' \;
    exit 1
  fi
fi

# Monochromize maps if it's mono mode but not in single scenario mode, which was handled before
if [[ "${HOMM3_NO_ART_BACKGROUND}" -eq 1 && "${SCENARIO_SEARCH}" == "" ]]; then
  CACHE_DIR="cache/monochrome-maps"
  mkdir -p ${CACHE_DIR}

  find . -type f -name "*tex" -not -regex ".*/\(draft-scenarios\|translated\|svg-inkscape\|templates\)/.*" \
    -exec "${grep_cmd}" -Po "maps[^}]*\.png" '{}' \; | while IFS= read -r IMG; do
    IMG="assets/${IMG}"
    monochrome_with_cache "${IMG}" "${CACHE_DIR}"
  done
fi

# Silence lualatex output and change file name if building a single scenario
JOB="main_${LANGUAGE}"
SILENT=""
if [[ "${SCENARIO}" != "" ]]; then
  JOB="${SCENARIO}"
  SILENT="-silent"
fi

# rm triggers latexmk build even if previous artifacts generated by faulty run of po4a prevent it from running
rm -f "${JOB}.aux" && \
  latexmk -pdflua -shell-escape ${SILENT} -jobname="${JOB}" "main_${LANGUAGE}.tex"

FILE="${JOB}.pdf"
${open} "${FILE}" &> /dev/null &

# Optimize PDF if it's a single scenario and ghostscript is available
if [[ "${SCENARIO}" != "" ]] && command -v gs >/dev/null 2>&1; then
  tools/optimize.sh -f "${FILE}"
  mv "${FILE%.*}_optimized.${FILE##*.}" "${FILE}"
fi

echo "${FILE}"
