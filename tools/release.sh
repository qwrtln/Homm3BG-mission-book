#!/usr/bin/env bash

set -e

LANGUAGE=$1

VERSION=$(cat .version)
FILE_VERSION=$(echo "${VERSION}" | tr . _)

declare -A languages=(
  ["en"]="English"
  ["pl"]="Polski"
  ["cs"]="Cestina"
)

echo "Building release ${VERSION} for ${languages[$LANGUAGE]}..."

mkdir -p release-${VERSION}

echo "Building digital version for ${languages[$LANGUAGE]}..."
tools/build.sh ${LANGUAGE} &> /dev/null
echo "Please inspect the PDF file."
echo "Optimizing digital build..."
tools/optimize.sh ${LANGUAGE} &> /dev/null
mv main_${LANGUAGE}_optimized.pdf release-${VERSION}/Heroes3_${languages[$LANGUAGE]}_Fan_Made_Mission_Book_${FILE_VERSION}.pdf

echo "Done."
