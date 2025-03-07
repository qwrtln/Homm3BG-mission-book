#!/usr/bin/env bash

case "$(uname -s)" in
    Darwin*)    open=open;;
    Linux*)     open=xdg-open;;
    MINGW*|MSYS*|CYGWIN*)    open=start;;
esac

cd draft-scenarios || exit
rm -f drafts.aux && \
  latexmk -pdflua -shell-escape drafts.tex
${open} drafts.pdf &> /dev/null &
