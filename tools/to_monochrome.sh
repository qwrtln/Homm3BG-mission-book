#!/usr/bin/env bash

IMAGE=$1

magick "${IMAGE}" -negate -threshold 50% -negate -fill white -opaque black "${IMAGE}"
magick "${IMAGE}" -morphology Dilate Diamond:2 "${IMAGE}"
magick "${IMAGE}" -channel RGB -negate "${IMAGE}"
