#!/bin/bash
set -e

IMAGE="ghcr.io/qwrtln/homm3bg:latest"

# Help message
show_help() {
    echo "Usage: $0 SCRIPT_PATH [ARGUMENTS]"
    echo ""
    echo "Where SCRIPT_PATH is the full path to the script, e.g.:"
    echo "  tools/build.sh"
    echo "  tools/compare_pages.sh"
    echo ""
    echo "Any additional arguments will be passed to the script."
    echo ""
    echo "Example: $0 tools/build.sh pl"
    echo "Example: $0 tools/compare_pages.sh -l en -r 5-9"
    exit 1
}

if [[ $# -eq 0 ]] || [[ "$1" == "help" ]] || [[ "$1" == "--help" ]]; then
    show_help
fi

SCRIPT_PATH="$1"
shift  # Remove the script path from arguments

# Extract the script name for PDF opening functionality
SCRIPT_NAME=$(basename "$SCRIPT_PATH" .sh)

CONTAINER_ENGINE=""

if command -v podman &>/dev/null; then
    CONTAINER_ENGINE="podman"
    echo "Using podman as container engine"
elif command -v docker &>/dev/null; then
    CONTAINER_ENGINE="docker"
    echo "Using docker as container engine"
else
    echo "Error: No container engine found. Please install podman or docker."
    exit 1
fi

echo "Running $SCRIPT_PATH" "${@}"

if [[ "$CONTAINER_ENGINE" = "podman" ]]; then
    podman run --rm -v "$(pwd):/data" "$IMAGE" "$SCRIPT_PATH" "$@"
else
    # For Docker, we also specify the user to avoid permission issues
    docker run --rm -v "$(pwd):/data" --user "$(id -u):$(id -g)" "$IMAGE" "$SCRIPT_PATH" "$@"
fi

# Open PDF after build script
if [[ "$SCRIPT_NAME" == "build" ]]; then
    # Determine the open command based on OS
    case "$(uname -s)" in
        Darwin*)    open_cmd="open";;
        Linux*)     open_cmd="xdg-open";;
        MINGW*|MSYS*|CYGWIN*)    open_cmd="start";;
    esac

    # Determine which PDF to open based on arguments
    pdf_file="main_en.pdf"

    # Check for language option
    for arg in "$@"; do
        if [[ "$arg" != -* && "$arg" != "" ]]; then
            pdf_file="main_$arg.pdf"
            break
        fi
    done

    # Check for draft option
    if [[ "$*" =~ -[a-zA-Z]*d[a-zA-Z]* ]]; then
        pdf_file="draft-scenarios/drafts.pdf"
    fi

    if [[ -n "$open_cmd" && -f "$pdf_file" ]]; then
        echo "Opening $pdf_file"
        $open_cmd "$pdf_file" &> /dev/null &
    elif [[ -n "$open_cmd" ]]; then
        echo "PDF file $pdf_file not found"
    fi
fi
