#!/usr/bin/env bash

case "$(uname -s)" in
    Darwin*)    open=open;;
    Linux*)     open=xdg-open;;
esac

LANGUAGE=$1

if [[ ${LANGUAGE} != en ]]; then
  po4a --no-update po4a.cfg
fi
# rm triggers latexmk build even if previous artifacts generated by faulty run of po4a prevent it from running
rm -f main_${LANGUAGE}.aux && \
  latexmk -pdflua -shell-escape main_${LANGUAGE}.tex
${open} main_${LANGUAGE}.pdf &
