#!/usr/bin/env bash

find . -iname "*.aux" -delete
rm -rf cache 2> /dev/null
rm -f * draft-scenarios/* screenshots/* 2> /dev/null
git restore \
  README.md \
  latexmkrc \
  main_cs.tex \
  main_en.tex \
  main_pl.tex \
  metadata.tex \
  mkdocs.yml \
  po4a.cfg \
  draft-scenarios
