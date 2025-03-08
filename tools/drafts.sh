#!/usr/bin/env bash

case "$(uname -s)" in
    Darwin*)    open=open;;
    Linux*)     open=xdg-open;;
    MINGW*|MSYS*|CYGWIN*)    open=start;;
esac

# For Windows only - replace symlink with a copy
if [[ "$(uname -s)" =~ ^(MINGW|MSYS|CYGWIN) ]]; then
    echo "Windows detected, handling symlinks."
    trap 'git restore draft-scenarios/assets' EXIT
    rm "draft-scenarios/assets"
    cp -r "assets" "draft-scenarios/assets"
fi

cd draft-scenarios || exit
rm -f drafts.aux && \
  latexmk -pdflua -shell-escape drafts.tex
${open} drafts.pdf &> /dev/null &
cd - || exit
