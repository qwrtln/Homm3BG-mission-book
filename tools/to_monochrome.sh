#!/usr/bin/env bash

IMAGE=$1

TEMP_DIR=$(mktemp -d)
PROCESSED_FILE="${TEMP_DIR}/processed.png"
ALPHA_FILE="${TEMP_DIR}/alpha.png"
trap 'rm -rf ${TEMP_DIR}' EXIT

# Extract alpha channel to preserve transparency
magick "${IMAGE}" -alpha extract "${ALPHA_FILE}"

# Adjust map images for monochrome build
magick "${IMAGE}" -negate -threshold 50% -negate -fill white -opaque black "${PROCESSED_FILE}"
magick "${PROCESSED_FILE}" -morphology Dilate Diamond:2 "${PROCESSED_FILE}"
magick "${PROCESSED_FILE}" -channel RGB -negate "${PROCESSED_FILE}"

# Recombine with the original alpha channel
magick "${PROCESSED_FILE}" "${ALPHA_FILE}" -alpha off -compose CopyOpacity -composite "${IMAGE}"
