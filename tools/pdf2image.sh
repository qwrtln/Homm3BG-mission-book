#!/usr/bin/env bash

source tools/.language_base.sh

# Default values
range=""
drafts=0
output_dir="screenshots"
custom_pdf=""

help() {
  echo "
    Usage: $(basename "$0") (<language> | -d | -f <file>) -r <range>

    Mandatory Arguments (choose one):
      <language>                    Specify the language for PDF (${valid_languages[*]}).
      -d, --drafts                  Use draft scenarios PDF instead of language-specific PDF.
      -f, --file <path>             Use a custom PDF file at the specified path.
      -r, --range <range>           Provide comma-separated list of pages or range of pages.
                                    Examples: 1,3,5 or 1-5 or 1,3-5,7

    Examples:
      $(basename "$0") -l en -r 1
      $(basename "$0") --language en --range 1-5
      $(basename "$0") -d -r 1,3-5
      $(basename "$0") -f custom.pdf -r 1-3
  "

  exit 2
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

  # Return as space-separated string
  printf '%s\n' "${result[@]}"
}

# Parse command line arguments
while [[ "$1" != "" ]]; do
  case $1 in
    -d | --drafts )
      drafts=1
      ;;
    -f | --file )
      shift
      custom_pdf=$1
      ;;
    -r | --range )
      shift
      range=$1
      ;;
    -h | --help )
      help
      ;;
    * )
      help
      ;;
  esac
  shift
done

# Validate arguments
if [[ "$drafts" -eq 1 && "$LANGUAGE" != "en" ]] || [[ "$drafts" -eq 1 && -n "$custom_pdf" ]] || [[ -n "$LANGUAGE" && -n "$custom_pdf" ]]; then
  echo "Error: -d/--drafts is mutually exclusive with non-English and -f/--file options."
  help
fi

if [[ "$drafts" -eq 0 && -z "$LANGUAGE" && -z "$custom_pdf" ]]; then
  echo "Error: You must specify either language, -d/--drafts, or -f/--file option."
  help
fi

if [[ -z "$range" ]]; then
  echo "Error: You must specify a page range with -r/--range option."
  help
fi

# Create output directory if it doesn't exist
mkdir -p "$output_dir"

# Set the source PDF and output prefix
if [[ -n "$custom_pdf" ]]; then
  source_pdf="$custom_pdf"
  output_prefix=$(basename "$custom_pdf" .pdf)
elif [[ "$drafts" -eq 1 ]]; then
  source_pdf="draft-scenarios/drafts.pdf"
  output_prefix="drafts"
else
  source_pdf="main_${LANGUAGE}.pdf"
  output_prefix="${LANGUAGE}"
fi

# Check if source PDF exists
if [[ ! -f "$source_pdf" ]]; then
  echo "Error: Source PDF '$source_pdf' not found."
  exit 1
fi

# Process each page or page range
readarray -t pages < <(parse_pages "$range")

for page in "${pages[@]}"; do
  echo "Processing page $page from $source_pdf..."
  output_file="${output_dir}/${output_prefix}-$(printf %02d "$page")"
  pdftoppm "$source_pdf" "$output_file" -f "$page" -l "$page" -png -singlefile
done

echo "Done. Images saved to $output_dir directory."
