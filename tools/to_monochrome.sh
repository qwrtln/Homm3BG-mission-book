#!/usr/bin/env bash

INPUT_IMAGE=$1
TEMP_DIR=$(mktemp -d)
BINARY_MASK="${TEMP_DIR}/binary_mask.png"
INVERTED_MASK="${TEMP_DIR}/inverted_mask.png"
MONO_IMAGE="${TEMP_DIR}/monochrome.png"
ALPHA_FILE="${TEMP_DIR}/alpha.png"
COLOR_PARTS="${TEMP_DIR}/color_parts.png"
MONO_PARTS="${TEMP_DIR}/mono_parts.png"
trap 'rm -rf ${TEMP_DIR}' EXIT

# Extract alpha channel to preserve transparency
magick "$INPUT_IMAGE" -alpha extract "$ALPHA_FILE"

# Step 1: Create binary mask
magick "$INPUT_IMAGE" \
  -colorspace HSL \
  -channel R \
  -separate +channel \
  -threshold 60% \
  -negate \
  -morphology close square:3 \
  -blur 0x3 \
  -threshold 85% \
  "$BINARY_MASK"
  # -morphology Close Diamond:3 \
  # -morphology Open Diamond:8 \
  # -morphology Close Octagon:32 \

# Create inverted mask
magick "$BINARY_MASK" -negate "$INVERTED_MASK"

# Step 2: Create monochrome version
magick "$INPUT_IMAGE" \
  -negate \
  -threshold 50% \
  -negate \
  -fill white -opaque black \
  -morphology Dilate Diamond:2 \
  -channel RGB -negate \
  "$MONO_IMAGE"

# Step 3: Create final composite image
magick "$INPUT_IMAGE" "$BINARY_MASK" -compose CopyOpacity -composite "$COLOR_PARTS" &
magick "$MONO_IMAGE" "$INVERTED_MASK" -compose CopyOpacity -composite "$MONO_PARTS" &
wait
magick "$COLOR_PARTS" "$MONO_PARTS" -compose Plus -composite \
  "$ALPHA_FILE" -alpha off -compose CopyOpacity -composite \
  "$INPUT_IMAGE"
