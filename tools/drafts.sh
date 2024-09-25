#!/usr/bin/env bash

case "$(uname -s)" in
    Darwin*)    open=open;;
    Linux*)     open=xdg-open;;
esac

cd draft-scenarios
rm -f drafts.aux && \
  latexmk -pdflua -shell-escape drafts.tex
${open} drafts.pdf &> /dev/null &
