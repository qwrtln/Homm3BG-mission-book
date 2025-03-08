#!/usr/bin/env bash

case "$(uname -s)" in
    Darwin*)    open=open;;
    Linux*)     open=xdg-open;;
    MINGW*|MSYS*|CYGWIN*)    open=start;;
esac

# For Windows only - replace symlink with a copy
if [[ "$(uname -s)" =~ ^(MINGW|MSYS|CYGWIN) ]]; then
    trap 'git restore draft-scenarios/assets' EXIT

    if [[ -L "draft-scenarios/assets" ]]; then
        target=$(readlink "draft-scenarios/assets")
        rm "draft-scenarios/assets"
        cp -r "$target" "draft-scenarios/assets"
    fi
fi

cd draft-scenarios || exit
rm -f drafts.aux && \
  latexmk -pdflua -shell-escape drafts.tex
${open} drafts.pdf &> /dev/null &
