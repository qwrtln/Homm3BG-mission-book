#!/usr/bin/env python3

"""
Ghostscript's pdfwrite cannot keep ToUnicode values longer than two UTF-16
units (https://bugs.ghostscript.com/show_bug.cgi?id=704674), so "difficult"
extracts as "difÏcult", and it swaps some CJK characters. It keeps the glyph
numbers (CIDs), so the right entries can be copied back from the PDF LuaTeX
wrote. Both PDFs must come from the same build: another build can number the
glyphs differently.
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
BFCHAR_BLOCK = re.compile(r"(beginbfchar)(.*?)(endbfchar)", re.S)


def parse_cmap(cmap: str) -> dict[int, str]:
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
    seen = set()
    for page in pdf.pages:
        resources = page.obj.get("/Resources", {})
        for _, font in resources.get("/Font", {}).items():
            if font.objgen in seen or "/ToUnicode" not in font:
                continue
            seen.add(font.objgen)
            yield str(font.get("/BaseFont", "")).split("+")[-1], font


def pick_source(candidates, subtype, current):
    # One name can cover several fonts that number their glyphs differently:
    # Czech babel's \uv quotes add an OT1 Type1 copy of LM Roman next to the
    # OpenType one. Mixing their maps garbles the text.
    same_type = [m for t, m in candidates if t == subtype]
    pool = same_type or [m for _, m in candidates]

    def agreement(mapping):
        return sum(mapping.get(cid) == uni for cid, uni in current.items())

    best = max(pool, key=agreement)
    # Ghostscript breaks a handful of entries, never most of them.
    shared = sum(cid in best for cid in current)
    if agreement(best) * 2 < shared:
        return None
    return best


def repair(source_path: str, gs_path: str, output_path: str) -> int:
    source = {}
    with pikepdf.open(source_path) as pdf:
        for name, font in fonts_with_tounicode(pdf):
            cmap = font.ToUnicode.read_bytes().decode("latin1")
            subtype = str(font.get("/Subtype", ""))
            source.setdefault(name, []).append((subtype, parse_cmap(cmap)))

    total = 0
    with pikepdf.open(gs_path) as pdf:
        for name, font in fonts_with_tounicode(pdf):
            candidates = source.get(name)
            if not candidates:
                continue
            cmap = font.ToUnicode.read_bytes().decode("latin1")
            subtype = str(font.get("/Subtype", ""))
            expected = pick_source(candidates, subtype, parse_cmap(cmap))
            if expected is None:
                print(f"{name}: no matching source font, left as is", file=sys.stderr)
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

            def fix_char(match: re.Match) -> str:
                nonlocal fixed
                want = expected.get(int(match[1], 16))
                if want and want != match[2].upper():
                    fixed += 1
                    return f"<{match[1]}><{want}>"
                return match[0]

            def fix_range_block(block: re.Match) -> str:
                return block[1] + BFRANGE.sub(fix_entry, block[2]) + block[3]

            def fix_char_block(block: re.Match) -> str:
                return block[1] + BFCHAR.sub(fix_char, block[2]) + block[3]

            cmap = BFRANGE_BLOCK.sub(fix_range_block, cmap)
            cmap = BFCHAR_BLOCK.sub(fix_char_block, cmap)
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
