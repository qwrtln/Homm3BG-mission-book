#!/usr/bin/env bash

find . -iname "*.aux" -delete
find . -type d -name "translated" -name "svg-inkscape" -exec rm -rf {} \; 2>/dev/null || true
rm -rf cache 2> /dev/null
rm -f ./* draft-scenarios/* screenshots/* 2> /dev/null
git restore \
  LICENSE \
  README.md \
  draft-scenarios \
  latexmkrc \
  main_cs.tex \
  main_de.tex \
  main_en.tex \
  main_fr.tex \
  main_pl.tex \
  main_ru.tex \
  metadata.tex \
  mkdocs.yml \
  po4a.cfg \
  run.sh \
  structure.tex
