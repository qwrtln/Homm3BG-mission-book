#!/usr/bin/env bash


cache_dir="$(pwd)/cache"
output_dir="screenshots"

help() {
  echo "
    Usage: ./tools/compare_pages.sh (-l <language> | -d | -s|--scenario SEARCH) -r <range> [OPTIONS]

    Mandatory Arguments (choose one):
      -l, --language <language>     Specify the language for comparison (en, pl, cs, de, fr).
      -d, --drafts                  Compare draft scenarios (mutually exclusive with -l and -s).
      -r, --range <range>           Provide comma-separated list of pages or range of pages you want to compare.

    Optional Arguments:
      -s, --scenario                Compare against a single scenario.
      -p, --printable               Compares your build against 'printable' build.
      -s, --single-page             Combines all compared pages into a single image.
      -m, --mono                    Uses monochrome version of files for baseline comparison.
                                    Only affects GitHub downloads, not local files.

    Examples:
      ./tools/compare_pages.sh -l en -r 1
      ./tools/compare_pages.sh --language en --range 1
      ./tools/compare_pages.sh -d -r 1,3-5
      ./tools/compare_pages.sh --drafts --range 1-10 --single-page

      ./tools/compare_pages.sh -l en -r 1,5-7,30 --single-page --mono
          - This will produce files 'en-01.png, en-05.png, en-06.png, en-07.png and en-30.png'.
          - Then because there is the '--single-page' parameter, it combines them to a single file 'en-all.png'.
          - It will use 'main_en-mono.pdf' from the repository as baseline because '--mono' was specified.
            It would use 'main_en.pdf' if this parameter was omitted.

      ./tools/compare_pages.sh -d -r 1-3 --mono
          - This will download 'drafts-mono.pdf' from GitHub for comparison.
  "

  exit 2
}

file_type() {
  local printable="$1"
  [[ "$printable" -eq 1 ]] && echo "printable" || echo "main"
}

base_file_path() {
  local identifier="$1"
  local printable="$2"
  local drafts="$3"
  local monochrome="$4"
  local type
  local file_suffix=""

  if [[ "$monochrome" -eq 1 ]]; then
    file_suffix="-mono"
  fi

  if [[ "$drafts" -eq 1 ]]; then
    echo "${cache_dir}/drafts${file_suffix}.pdf"
  else
    type=$(file_type "$printable")
    echo "${cache_dir}/${type}_${identifier}${file_suffix}.pdf"
  fi
}

scenario_file_path() {
  local language="$1"
  local scenario="$2"
  local monochrome="$3"

  if [[ "$monochrome" -eq 1 ]]; then
    file_suffix="_mono"
  fi
  find "${cache_dir}" -name "${scenario}_${language}${file_suffix}*"
}

_sha_from_filename() {
  local filename="$1"
  echo "$filename" | grep -oE '[0-9a-f]{40}'
}

_sha_from_remote() {
  local git_branch="$1"
  curl -s -f -H "Accept: application/vnd.github.VERSION.sha" "https://api.github.com/repos/qwrtln/Homm3BG-mission-book-build-artifacts/commits/$git_branch" 2>/dev/null
}

_remote_pdf_file_from_filename() {
  local filename="$1"
  local sha=$(_sha_from_filename "$filename")
  if [[ $sha == "" ]]; then
    # No SHA - file is absent and its name was already constructed
    echo "$filename"
  else
    # It is a local file with SHA
    basename "${filename%_"$sha".pdf}.pdf"
  fi
}

_git_branch_from_filename() {
  local filename="$1"
  remote_pdf_file=$(_remote_pdf_file_from_filename "$filename")
  git_branch=""
  if [[ "$remote_pdf_file" == *"_mono.pdf" ]]; then
    echo "${LANGUAGE}-${remote_pdf_file%_"$LANGUAGE"_mono.pdf}-mono"
  else
    echo "${LANGUAGE}-${remote_pdf_file%_"$LANGUAGE".pdf}-color"
  fi
}

download_base_file() {
  local identifier="$1"
  local printable="$2"
  local drafts="$3"
  local monochrome="$4"
  local output_file=""
  local type
  local url=""
  local file_suffix=""

  if [[ "$monochrome" -eq 1 ]]; then
    file_suffix="-mono"
  fi

  if [[ "$drafts" -eq 1 ]]; then
    url="https://raw.githubusercontent.com/qwrtln/Homm3BG-mission-book-build-artifacts/drafts/drafts${file_suffix}.pdf"
    output_file=$(base_file_path "$identifier" "$printable" "$drafts" "$monochrome")
  else
    type=$(file_type "$printable")
    url="https://raw.githubusercontent.com/qwrtln/Homm3BG-mission-book-build-artifacts/${identifier}/${type}_${identifier}${file_suffix}.pdf"
    output_file=$(base_file_path "$identifier" "$printable" "$drafts" "$monochrome")
  fi

  mkdir -p "$cache_dir"
  curl -o "$output_file" "$url"
}

download_scenario() {
  local language="$1"
  local filename="$2"
  local monochrome="$3"
  local file_suffix=""
  if [[ "$monochrome" -eq 1 ]]; then
    file_suffix="_mono"
  fi
  if [[ "$filename" == "" ]]; then
    filename="${SCENARIO_NAME}_${LANGUAGE}${file_suffix}.pdf"
  fi

  local git_branch=$(_git_branch_from_filename "$filename")
  local remote_sha=$(_sha_from_remote "$git_branch")

  local remote_filename=$(_remote_pdf_file_from_filename "$filename")
  local url="https://raw.githubusercontent.com/qwrtln/Homm3BG-mission-book-build-artifacts/$git_branch/$remote_filename"
  local output_filename="${SCENARIO_NAME}_${LANGUAGE}${file_suffix}_${remote_sha}.pdf"

  mkdir -p "$cache_dir"
  curl -o "$cache_dir/$output_filename" "$url"

  # Ensure old file is deleted
  find "$cache_dir" -maxdepth 1 -name "${SCENARIO_NAME}_${LANGUAGE}${file_suffix}*.pdf" ! -name "$output_filename" -delete &> /dev/null

  echo "$cache_dir/$output_filename"
}

file_mod_time() {
  local file=$1
  if [[ "$(uname -s)" == "Darwin" ]]; then
    stat -f %m "$file"
  else
    stat -c %Y "$file"
  fi
}

# Check if cached PDF is up-to-date
is_pdf_current() {
  local pdf_file="$1"

  if [[ ! -f "$pdf_file" ]]; then
    return 1
  fi

  # First check: check commit SHA using GitHub API
  if command -v pdftotext >/dev/null 2>&1 && command -v curl >/dev/null 2>&1; then
    # Get latest commit SHA and check if it's in the PDF
    local latest_sha
    latest_sha=$(curl -s -f -H "Accept: application/vnd.github.VERSION.sha" "https://api.github.com/repos/qwrtln/Homm3BG-mission-book/commits/main" 2>/dev/null)
    if [[ -n "$latest_sha" ]] && pdftotext "$pdf_file" - 2>/dev/null | grep -q "${latest_sha:0:7}"; then
      return 0
    fi
  fi

  # Fallback: time-based check if poppler is not available
  local mod_time now age
  mod_time=$(file_mod_time "$pdf_file")
  now=$(date +%s)
  age=$((now - mod_time))  # seconds

  # If file is newer than 3 hours, consider it current
  if [[ $age -le 10800 ]]; then
    return 0
  fi

  return 1
}

is_scenario_current() {
  local scenario_pdf_file="$1"

  if [[ ! -f "$scenario_pdf_file" ]]; then
    return 1
  fi

  # Extract commit SHA from cached PDF file name
  scenario_git_sha=$(_sha_from_filename "$scenario_pdf_file")
  # Extract remote PDF file name
  remote_pdf_file=$(_remote_pdf_file_from_filename "$scenario_pdf_file")

  # Construct git branch name from PDF file name and language
  git_branch=$(_git_branch_from_filename "$scenario_pdf_file")
  # Check remote commit SHA using GitHub API
  local latest_sha
  latest_sha=$(_sha_from_remote "$git_branch")

  if [[ "$latest_sha" != "$scenario_git_sha" ]]; then
    return 1
  fi
  return 0
}

# Only download a base files if they are not already present locally or don't match current git ref.
# Otherwise we use the cached one to speed-up the workflow.
ensure_base_file() {
  local base_file
  local identifier="$1"
  local printable="$2"
  local drafts="$3"
  local monochrome="$4"
  local base_file=$(base_file_path "$identifier" "$printable" "$drafts" "$monochrome")

  if ! is_pdf_current "$base_file"; then
    download_base_file "$language" "$printable" "$drafts" "$monochrome"
  fi

  echo "$base_file"
}

ensure_scenario_file() {
  local base_file
  local language="$1"
  local scenario="$2"
  local monochrome="$3"
  local base_file=$(scenario_file_path "$language" "$scenario" "$monochrome")

  if [[ "$base_file" == "" ]] || ! is_scenario_current "$base_file"; then
    base_file=$(download_scenario "$language" "$base_file" "$monochrome")
  fi

  echo "$base_file"
}

# Parses the --range argument into an array of pages.
# e.g. '1,2,4-6,20' becomes [1,2,4,5,6,20]
parse_pages() {
  local range="$1"
  local result=()

  IFS=',' read -ra parts <<< "$range"

  for part in "${parts[@]}"; do
    if [[ $part == *"-"* ]]; then
      start=$(echo "$part" | cut -d"-" -f1)
      end=$(echo "$part" | cut -d"-" -f2)
      for ((i=start; i<=end; i++)); do
        result+=("$i")
      done
    else
      result+=("$part")
    fi
  done

  # Return as space-separated string to be captured by readarray
  printf '%s\n' "${result[@]}"
}

#
# MAIN FLOW
#

LANGUAGE=""
RANGE=""
PRINTABLE=0
DRAFTS=0
MONOCHROME=0
SCENARIO_SEARCH=""
SCENARIO_NAME=""

while [[ "$1" != "" ]]; do
  case $1 in
    -l | --language )
      shift
      LANGUAGE=$1
      ;;
    -d | --drafts )
      DRAFTS=1
      ;;
    -p | --printable )
      PRINTABLE=1
      ;;
    -r | --range )
      shift
      RANGE=$1
      ;;
    -s | --scenario )
      shift
      if [[ $# -lt 1 ]]; then
        echo "Error: --scenario requires a string argument" >&2
        usage
      fi
      SCENARIO_SEARCH="$1"
      ;;
    -m | --mono )
      MONOCHROME=1
      ;;
    * )
      help
      ;;
  esac
  shift
done

# Check that we have either language or draft but not both
if [[ "$DRAFTS" -eq 1 && (-n "$LANGUAGE" || -n "$scenario") ]]; then
  echo "Error: -d/--drafts is mutually exclusive with -l/--language and -s/--scenario options."
  help
fi

if [[ -z "$RANGE" ]]; then
  echo "Error: You must specify a page range with -r/--range option."
  help
fi

if [[ -z "$LANGUAGE" ]]; then
  LANGUAGE="en"
fi

if [[ "$SCENARIO_SEARCH" ]]; then
  tools/_find_scenario.sh "$SCENARIO_SEARCH"
  SCENARIO_NAME=$(grep -o "/[a-z_]*\.tex" structure.tex | sed -e "s@/@@" -e "s@.tex@@")
  git restore structure.tex
fi

# Set the identifier for file paths and naming
identifier="$LANGUAGE"
if [[ "$DRAFTS" -eq 1 ]]; then
  identifier="drafts"
  # Printable option doesn't apply to drafts
  if [[ "$PRINTABLE" -eq 1 ]]; then
    echo "Note: --printable option ignored for drafts."
    PRINTABLE=0
  fi
fi

base_file=""
echo "Checking if there is the base file for comparison..."
if [[ "$SCENARIO_NAME" != "" ]]; then
  base_file=$(ensure_scenario_file "$LANGUAGE" "$SCENARIO_NAME" "$MONOCHROME")
else
  base_file=$(ensure_base_file "$LANGUAGE" "$PRINTABLE" "$DRAFTS" "$MONOCHROME")
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf -- "$tmp_dir"' EXIT

readarray -t pages < <(parse_pages "$RANGE")

for page in "${pages[@]}"; do
  echo "Making images of ${base_file} and $([ "$DRAFTS" -eq 1 ] && echo "drafts.pdf" || [ "$SCENARIO_NAME" != "" ] && echo "${SCENARIO_NAME}.pdf" || echo "main_${LANGUAGE}.pdf") for page ${page}..."
  pdftoppm "${base_file}" "${tmp_dir}/aa-$(printf %02d "$page")" -f "${page}" -l "${page}" -png -progress -singlefile &

  if [[ "$DRAFTS" -eq 1 ]]; then
    pdftoppm "draft-scenarios/drafts.pdf" "${tmp_dir}/bb-$(printf %02d "$page")" -f "${page}" -l "${page}" -png -progress -singlefile &
  elif [[ "$SCENARIO_NAME" != "" ]]; then
    pdftoppm "${SCENARIO_NAME}.pdf" "${tmp_dir}/bb-$(printf %02d "$page")" -f "${page}" -l "${page}" -png -progress -singlefile &
  else
    pdftoppm "main_${LANGUAGE}.pdf" "${tmp_dir}/bb-$(printf %02d "$page")" -f "${page}" -l "${page}" -png -progress -singlefile &
  fi
done

wait

if [[ "$SCENARIO_NAME" != "" ]]; then
  identifier="$SCENARIO_NAME"
fi
for page in "${pages[@]}"; do
  echo "Combining pages $(printf %02d "$page")..."
  echo "${tmp_dir}"/*"$(printf %02d "$page")".png
  echo "${tmp_dir}/${identifier}-$(printf %02d "$page").png"
  montage "${tmp_dir}"/*"$(printf %02d "$page")".png -tile 2x1 -geometry +0+0 "${tmp_dir}/${identifier}-$(printf %02d "$page").png" && \
  rm "${tmp_dir}/aa-$(printf %02d "$page").png" "${tmp_dir}/bb-$(printf %02d "$page").png" &
done
wait

mkdir -p screenshots
mv "${tmp_dir}/${identifier}"* screenshots

echo "Done. Images saved to $output_dir directory."
