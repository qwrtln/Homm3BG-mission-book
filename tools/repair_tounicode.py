#!/usr/bin/env python3

"""
repair_tounicode.py

Restore the text layer that Ghostscript breaks in LuaTeX PDFs.

A font's ToUnicode map says which letters each glyph spells. LuaTeX maps the
"ffi" ligature to three letters, <0066 0066 0069>. Ghostscript's pdfwrite keeps
the first letter and adds the other two together: 0x66 + 0x69 = 0xCF, so
"difficult" extracts as "difÏcult" ("ffl" becomes "fÒ" the same way). Search,
copy-paste and tools/pdf_screenshot_diff.py all see the broken word.

Ghostscript keeps the glyph numbers (CIDs), so the correct entries can be copied
back from the PDF LuaTeX wrote. Only single-glyph entries that disagree with the
source are rewritten; pages, images and fonts stay as Ghostscript wrote them.

Usage:

    python repair_tounicode.py luatex.pdf ghostscript.pdf output.pdf

Both input PDFs must come from the same build: a different build can number
the glyphs differently.

Dependencies:

    pip install pikepdf
"""

from __future__ import annotations

import argparse
import re
import sys

import pikepdf

HEX = r"<([0-9A-Fa-f]+)>"
BFCHAR = re.compile(HEX + r"\s*" + HEX)
BFRANGE = re.compile(HEX + r"\s*" + HEX + r"\s*" + HEX)
BFRANGE_BLOCK = re.compile(r"(beginbfrange)(.*?)(endbfrange)", re.S)


def parse_cmap(cmap: str) -> dict[int, str]:
    """Map each CID to its Unicode hex string, from bfchar and bfrange blocks."""
    mapping = {}
    for block in re.findall(r"beginbfchar(.*?)endbfchar", cmap, re.S):
        for src, dst in BFCHAR.findall(block):
            mapping[int(src, 16)] = dst.upper()
    for block in re.findall(r"beginbfrange(.*?)endbfrange", cmap, re.S):
        for lo, hi, dst in BFRANGE.findall(block):
            lo, hi, start = int(lo, 16), int(hi, 16), int(dst, 16)
            for offset in range(hi - lo + 1):
                mapping[lo + offset] = f"{start + offset:0{len(dst)}X}"
    return mapping


def fonts_with_tounicode(pdf: pikepdf.Pdf):
    """Yield (name without subset prefix, font) once per font object."""
    seen = set()
    for page in pdf.pages:
        resources = page.obj.get("/Resources", {})
        for _, font in resources.get("/Font", {}).items():
            if font.objgen in seen or "/ToUnicode" not in font:
                continue
            seen.add(font.objgen)
            yield str(font.get("/BaseFont", "")).split("+")[-1], font


def repair(source_path: str, gs_path: str, output_path: str) -> int:
    source = {}
    with pikepdf.open(source_path) as pdf:
        for name, font in fonts_with_tounicode(pdf):
            cmap = font.ToUnicode.read_bytes().decode("latin1")
            source.setdefault(name, {}).update(parse_cmap(cmap))

    total = 0
    with pikepdf.open(gs_path) as pdf:
        for name, font in fonts_with_tounicode(pdf):
            expected = source.get(name)
            if not expected:
                continue
            fixed = 0

            def fix_entry(match: re.Match) -> str:
                nonlocal fixed
                lo, hi = int(match[1], 16), int(match[2], 16)
                want = expected.get(lo)
                if lo == hi and want and want != match[3].upper():
                    fixed += 1
                    return f"<{match[1]}><{match[2]}><{want}>"
                return match[0]

            def fix_block(block: re.Match) -> str:
                return block[1] + BFRANGE.sub(fix_entry, block[2]) + block[3]

            cmap = font.ToUnicode.read_bytes().decode("latin1")
            cmap = BFRANGE_BLOCK.sub(fix_block, cmap)
            if fixed:
                font.ToUnicode.write(cmap.encode("latin1"))
                print(f"{name}: fixed {fixed} ToUnicode entries")
                total += fixed
        pdf.save(output_path)
    return total


def main():
    parser = argparse.ArgumentParser(
        description="Restore ToUnicode entries Ghostscript broke, from the LuaTeX original."
    )
    parser.add_argument("source", help="PDF as LuaTeX wrote it")
    parser.add_argument("ghostscript", help="The same PDF after Ghostscript")
    parser.add_argument("output", help="Where to write the repaired PDF")
    args = parser.parse_args()

    if args.output == args.ghostscript:
        parser.error("OUTPUT must differ from GHOSTSCRIPT")

    total = repair(args.source, args.ghostscript, args.output)
    if total == 0:
        print("No ToUnicode entries needed fixing.", file=sys.stderr)


if __name__ == "__main__":
    main()
