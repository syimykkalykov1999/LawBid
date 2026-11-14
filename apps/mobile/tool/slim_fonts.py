#!/usr/bin/env python3
"""Rebuilds the slim copies of the two bundled text fonts (owner 2026-10-23,
web pass; docs/perf/WEB_PASS_2026-10-23.md, "Fonts").

What it does to an upstream variable font (Inter, Source Serif 4):
  * narrows the weight axis to 400-900 (the app asks for w400..w900, never
    lighter). The optical-size axis is KEPT: pinning it would shave another
    ~250 KB (brotli) on the web, but CoreText applies it automatically at
    large sizes, so iOS / macOS (and the goldens) would render the serif
    headings differently;
  * drops what no language of the app can reach: the private-use area and
    the enclosed-alphanumeric / arrows-C planes, and the stylistic-set /
    character-variant / discretionary-ligature layout features. It keeps
    kerning, ligatures, case forms, tabular / proportional / lining / oldstyle
    figures, slashed zero, fractions, super/subscripts.
Both fonts only ever covered Latin, Cyrillic, Greek and Vietnamese; every
other script of the 85 languages already falls back to the system font, so
no script is cut.

Needs fonttools (+ brotli is not required): python3 -m venv v && v/bin/pip
install fonttools. Usage, from apps/mobile:
  tool/slim_fonts.py <upstream Inter-Variable.ttf> assets/fonts/Inter-Variable.ttf keep
  tool/slim_fonts.py <upstream SourceSerif4-Variable.ttf> assets/fonts/SourceSerif4-Variable.ttf keep
(a number instead of `keep` pins the optical size at that value.)

Web copies (owner row 128, 2026-11-14), run by web-deploy.yml on the built
bundle only — the files in assets/ and the phones keep the full axis:
  tool/slim_fonts.py web build/web/assets/assets/fonts
pins the optical-size axis at the font's own default and stores the `post`
table without glyph names. FreeType (CanvasKit / skwasm on the web) never
moves `opsz` by itself and the app never sets it (no FontVariation in lib/),
so the web always drew the default optical size: same outlines, same pixels.
The weight axis stays (the engine does move it, w400..w900). Brotli of the
two text fonts: 546 KB -> ~300 KB.
"""
import sys

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

LAYOUT_FEATURES = [
    'kern', 'liga', 'clig', 'calt', 'ccmp', 'locl', 'mark', 'mkmk', 'case',
    'tnum', 'pnum', 'lnum', 'onum', 'zero', 'frac', 'numr', 'dnom', 'sups',
    'subs', 'ordn', 'smcp', 'c2sc', 'rlig', 'rclt',
]


def main(src: str, dst: str, opsz: float | None, wght_min: float = 400) -> None:
    limits: dict = {'wght': (wght_min, 900)}
    if opsz is not None:
        limits['opsz'] = opsz
    font = instancer.instantiateVariableFont(TTFont(src), limits, inplace=False)
    tmp = dst + '.inst.ttf'
    font.save(tmp)

    keep = sorted(
        cp
        for cp in TTFont(tmp).getBestCmap()
        if not (0xE000 <= cp <= 0xF8FF) and cp < 0x1F000
    )
    opts = subset.Options()
    opts.layout_features = LAYOUT_FEATURES
    # Everything below the glyph / feature cuts stays as upstream: with the
    # name table trimmed, `prep` or `post` names dropped, the golden tests
    # (macOS rasteriser) moved by ~2.5 % of the pixels; untouched, 0.
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    opts.glyph_names = True
    opts.hinting = True
    opts.drop_tables = []
    subsetter = subset.Subsetter(opts)
    slim = TTFont(tmp)
    subsetter.populate(unicodes=keep)
    subsetter.subset(slim)
    slim.save(dst)
    import os

    os.remove(tmp)


def web(fonts_dir: str) -> None:
    import os

    for name in ('Inter-Variable.ttf', 'SourceSerif4-Variable.ttf'):
        path = os.path.join(fonts_dir, name)
        src = TTFont(path)
        before = os.path.getsize(path)
        cmap = sorted(src.getBestCmap())
        opsz = next(a.defaultValue for a in src['fvar'].axes if a.axisTag == 'opsz')
        font = instancer.instantiateVariableFont(src, {'opsz': opsz}, inplace=False)
        font['post'].formatType = 3.0
        font.save(path)
        out = TTFont(path)
        axes = [a.axisTag for a in out['fvar'].axes]
        if sorted(out.getBestCmap()) != cmap or axes != ['wght']:
            sys.exit(f'{name}: characters or axes changed ({axes})')
        print(f'{name}: opsz pinned at {opsz:g}, {before} -> {os.path.getsize(path)} bytes')


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == 'web':
        web(sys.argv[2])
        sys.exit(0)
    if len(sys.argv) < 4:
        sys.exit(__doc__)
    main(
        sys.argv[1],
        sys.argv[2],
        None if sys.argv[3] == 'keep' else float(sys.argv[3]),
    )
