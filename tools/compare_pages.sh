#!/usr/bin/env bash


cache_dir="$(pwd)/cache"
output_dir="screenshots"

help() {
  echo "
    Usage: ./tools/compare_pages.sh (-l <language> | -d) -r <range> [OPTIONS]

    Mandatory Arguments (choose one):
      -l, --language <language>     Specify the language for comparison (en, pl, cs, de, fr).
      -d, --drafts                  Compare draft scenarios (mutually exclusive with -l).
      -r, --range <range>           Provide comma-separated list of pages or range of pages you want to compare.

    Optional Arguments:
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

# Only download a base file if it's not already present locally or
# is older than 1 hour. Otherwise we use the cached one to speed-up the workflow.
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

language=""
range=""
printable=0
single_page=0
drafts=0
monochrome=0

while [[ "$1" != "" ]]; do
  case $1 in
    -l | --language )
      shift
      language=$1
      ;;
    -d | --drafts )
      drafts=1
      ;;
    -p | --printable )
      printable=1
      ;;
    -r | --range )
      shift
      range=$1
      ;;
    -s | --single-page )
      single_page=1
      ;;
    -m | --mono )
      monochrome=1
      ;;
    * )
      help
      ;;
  esac
  shift
done

# Check that we have either language or draft but not both
if [[ "$drafts" -eq 1 && -n "$language" ]]; then
  echo "Error: -d/--drafts and -l/--language options are mutually exclusive."
  help
fi

# Check that we have either language or draft
if [[ "$drafts" -eq 0 && -z "$language" ]]; then
  echo "Error: You must specify either -l/--language or -d/--drafts option."
  help
fi

if [[ -z "$range" ]]; then
  echo "Error: You must specify a page range with -r/--range option."
  help
fi

# Set the identifier for file paths and naming
identifier="$language"
if [[ "$drafts" -eq 1 ]]; then
  identifier="drafts"
  # Printable option doesn't apply to drafts
  if [[ "$printable" -eq 1 ]]; then
    echo "Note: --printable option ignored for drafts."
    printable=0
  fi
fi

echo "Checking if there is the base file for comparison..."
base_file=$(ensure_base_file "$language" "$printable" "$drafts" "$monochrome")

tmp_dir="$(mktemp -d)"
trap 'rm -rf -- "$tmp_dir"' EXIT

readarray -t pages < <(parse_pages "$range")

for page in "${pages[@]}"; do
  echo "Making images of ${base_file} and $([ "$drafts" -eq 1 ] && echo "drafts.pdf" || echo "main_${language}.pdf") for page ${page}..."
  pdftoppm "${base_file}" "${tmp_dir}/aa" -f "${page}" -l "${page}" -png -progress &

  if [[ "$drafts" -eq 1 ]]; then
    pdftoppm "draft-scenarios/drafts.pdf" "${tmp_dir}/bb" -f "${page}" -l "${page}" -png -progress &
  else
    pdftoppm "main_${language}.pdf" "${tmp_dir}/bb" -f "${page}" -l "${page}" -png -progress &
  fi
done

wait

for page in "${pages[@]}"; do
  echo "Combining pages $(printf %02d "$page")..."
  montage "${tmp_dir}"/*"$(printf %02d "$page")".png -tile 2x1 -geometry +0+0 "${tmp_dir}/${identifier}-$(printf %02d "$page").png" && \
  rm "${tmp_dir}/aa-$(printf %02d "$page").png" "${tmp_dir}/bb-$(printf %02d "$page").png" &
done

if [[ "$single_page" -eq 1 ]]; then
  wait
  montage "${tmp_dir}/${identifier}"* -tile "1x" -geometry +0+0 "${tmp_dir}/${identifier}-all.png"
fi

wait

mkdir -p screenshots
mv "${tmp_dir}/${identifier}"* screenshots

echo "Done. Images saved to $output_dir directory."
