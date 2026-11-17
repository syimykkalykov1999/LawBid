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
Row 128 again (2026-11-15): the web copies also keep only the OpenType
features HarfBuzz can apply on the web (WEB_FEATURES below) and the glyphs
they reach: Source Serif 4 loses its small caps, old-style figures and
friends that nothing asks for. Brotli ~300 KB -> ~254 KB. Before a file is
replaced, uharfbuzz (Apache-2.0) shapes ~31 000 texts at 9 weights in the
upstream file and in the web copy and the job fails on any difference in
glyph outline, cluster, advance or offset. Needs: pip install
fonttools==4.68.0 uharfbuzz==0.57.0.
Row 128 (2026-11-17): with the FontManifest.json path as a third argument
  tool/slim_fonts.py web build/web/assets/assets/fonts build/web/assets/FontManifest.json
the web copies are written as WOFF2 (fontTools; needs brotli==1.2.1 too),
the .ttf copies are removed and the manifest names the .woff2 files.
Brotli of the .ttf 253 653 B -> WOFF2 234 000 B. Each file is decoded back
and must give the same tables and glyphs, else the job fails.
"""
import io
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


# Row 128 (2026-11-15), web copies only: the OpenType features the web text
# engine (HarfBuzz inside CanvasKit / skwasm) can ever apply. HarfBuzz turns
# on its default set by itself (hb-ot-shape.cc: common + horizontal features,
# rvrn, the direction features, and frac / numr / dnom around U+2044); the
# app asks for one more, `tnum` (FontFeature.tabularFigures, the only
# FontFeature in lib/). Everything else (small caps, old-style figures,
# case forms, ordinals, sups / subs, slashed zero...) is never requested,
# so its lookups and the glyphs only they reach are dead bytes on the web.
WEB_FEATURES = [
    'abvm', 'blwm', 'ccmp', 'locl', 'mark', 'mkmk', 'rlig', 'rvrn',
    'ltra', 'ltrm', 'rtla', 'rtlm', 'frac', 'numr', 'dnom',
    'calt', 'clig', 'curs', 'dist', 'kern', 'liga', 'rclt',
    'tnum',
]
WEB_WEIGHTS = (400, 450, 500, 550, 600, 650, 700, 800, 900)


def _web_corpus() -> list[tuple[str, dict]]:
    """Text the shaping check runs: every character of the font alone, every
    pair inside Basic Latin, Cyrillic and Greek (kerning), the app's German
    and longest-string test bundles, and digits / fractions with and without
    `tnum`."""
    import json
    import os

    here = os.path.dirname(os.path.abspath(__file__))
    l10n = os.path.join(here, '..', 'test', 'l10n')
    texts: list[str] = []
    for f in ('lang_de.json', 'longest_strings.json'):
        p = os.path.join(l10n, f)
        if os.path.exists(p):
            with open(p, encoding='utf-8') as fh:
                data = json.load(fh)
            vals = data.values() if isinstance(data, dict) else data
            texts += [v for v in vals if isinstance(v, str)]
    blocks = [
        [chr(c) for c in range(0x20, 0x7F)],
        [chr(c) for c in range(0x410, 0x450)] + ['Ё', 'ё'],
        [chr(c) for c in range(0x391, 0x3CA) if c != 0x3A2],
    ]
    for block in blocks:
        texts += [a + b for a in block for b in block]
    texts += [
        'Tiếng Việt: Xin chào, cảm ơn, người, được, những',
        '0123456789 1/2 1⁄2 3⁄4 12⁄345 $1,234.56 №7 ½ ¼',
    ]
    plain = [(t, {}) for t in texts]
    tab = [(t, {'tnum': True}) for t in ('0123456789', '1⁄2 3⁄4', '$1,234.56', '10:45')]
    return plain + tab


def _shape_all(data: bytes, cps: list[int], corpus, weight: int) -> list:
    import uharfbuzz as hb
    from fontTools.pens.recordingPen import RecordingPen

    font = hb.Font(hb.Face(hb.Blob(data)))
    font.set_variations({'wght': weight})
    outlines: dict[int, tuple] = {}

    def outline(gid: int) -> tuple:
        if gid not in outlines:
            pen = RecordingPen()
            font.draw_glyph_with_pen(gid, pen)
            outlines[gid] = tuple(pen.value)
        return outlines[gid]

    out = []
    items = [(chr(c), {}) for c in cps] + corpus
    for text, features in items:
        buf = hb.Buffer()
        buf.add_str(text)
        buf.guess_segment_properties()
        hb.shape(font, buf, features)
        out.append(tuple(
            (outline(i.codepoint), i.cluster, p.x_advance, p.y_advance, p.x_offset, p.y_offset)
            for i, p in zip(buf.glyph_infos, buf.glyph_positions)
        ))
    return out


def _same_glyph(a, b) -> bool:
    """The glyph a rasteriser sees: points, on-curve and overlap flags,
    contours, components, instructions, bounding box."""
    if a.numberOfContours != b.numberOfContours:
        return False
    for attr in ('xMin', 'yMin', 'xMax', 'yMax'):
        if getattr(a, attr, None) != getattr(b, attr, None):
            return False
    if a.isComposite():
        ca = [(c.glyphName, c.x, c.y, c.flags, getattr(c, 'transform', None)) for c in a.components]
        cb = [(c.glyphName, c.x, c.y, c.flags, getattr(c, 'transform', None)) for c in b.components]
        if ca != cb:
            return False
    elif a.numberOfContours > 0:
        if (list(a.coordinates) != list(b.coordinates)
                or list(a.endPtsOfContours) != list(b.endPtsOfContours)
                or [f & 0x41 for f in a.flags] != [f & 0x41 for f in b.flags]):
            return False
    pa = a.program.getBytecode() if hasattr(a, 'program') else b''
    pb = b.program.getBytecode() if hasattr(b, 'program') else b''
    return pa == pb


def _woff2(name: str, slim: bytes) -> bytes:
    """Row 128 (2026-11-17): the web copy as WOFF2 (fontTools, MIT: the
    glyf / loca transform and Brotli of the W3C WOFF2 format), ~8 % fewer
    bytes than the Brotli of the .ttf. The web engine decodes WOFF2 itself
    (its own Noto fallback fonts are .woff2 and go through the same
    MakeFreeTypeFaceFromData / typefaceCreate call as our assets). Proof,
    not trust: the file is decoded back and every table must be the same,
    glyph by glyph for glyf, field by field for head / hmtx."""
    f = TTFont(io.BytesIO(slim), recalcTimestamp=False)
    f.flavor = 'woff2'
    buf = io.BytesIO()
    f.save(buf)
    packed = buf.getvalue()
    a, b = TTFont(io.BytesIO(slim)), TTFont(io.BytesIO(packed))
    order = a.getGlyphOrder()
    if order != b.getGlyphOrder() or sorted(a.keys()) != sorted(b.keys()):
        sys.exit(f'{name}: WOFF2 changed the glyph order or the tables')
    for tag in a.keys():
        if tag in ('GlyphOrder', 'head', 'glyf', 'loca', 'hmtx'):
            continue
        if a.getTableData(tag) != b.getTableData(tag):
            sys.exit(f'{name}: WOFF2 changed table {tag}')
    ha, hb = vars(a['head']).copy(), vars(b['head']).copy()
    for h in (ha, hb):
        h.pop('checkSumAdjustment', None)
        h['flags'] = h.get('flags', 0) & ~0x800  # "lossless transform" bit
    if ha != hb:
        sys.exit(f'{name}: WOFF2 changed head')
    if a['hmtx'].metrics != b['hmtx'].metrics:
        sys.exit(f'{name}: WOFF2 changed hmtx')
    ga, gb = a['glyf'], b['glyf']
    for g in order:
        if not _same_glyph(ga[g], gb[g]):
            sys.exit(f'{name}: WOFF2 changed glyph {g}')
    return packed


def web(fonts_dir: str, manifest: str | None = None) -> None:
    import json
    import os

    corpus = _web_corpus()
    renamed: dict[str, str] = {}
    for name in ('Inter-Variable.ttf', 'SourceSerif4-Variable.ttf'):
        path = os.path.join(fonts_dir, name)
        with open(path, 'rb') as fh:
            original = fh.read()
        src = TTFont(path)
        before = len(original)
        cmap = sorted(src.getBestCmap())
        opsz = next(a.defaultValue for a in src['fvar'].axes if a.axisTag == 'opsz')
        pinned = io.BytesIO()
        instancer.instantiateVariableFont(src, {'opsz': opsz}, inplace=False).save(pinned)
        pinned.seek(0)
        font = TTFont(pinned)  # reloaded: subsetting the in-memory instance trips on lazy gvar
        # Same options as main(): only glyphs and features go, every other
        # table stays as upstream.
        opts = subset.Options()
        opts.layout_features = WEB_FEATURES
        opts.name_IDs = ['*']
        opts.notdef_outline = True
        opts.glyph_names = True
        opts.hinting = True
        opts.drop_tables = []
        subsetter = subset.Subsetter(opts)
        subsetter.populate(unicodes=cmap)
        subsetter.subset(font)
        font['post'].formatType = 3.0
        buf = io.BytesIO()
        font.save(buf)
        slim = buf.getvalue()
        out = TTFont(io.BytesIO(slim))
        axes = [a.axisTag for a in out['fvar'].axes]
        if sorted(out.getBestCmap()) != cmap or axes != ['wght']:
            sys.exit(f'{name}: characters or axes changed ({axes})')
        # Proof, not trust: shape the corpus with HarfBuzz (the web engine's
        # shaper) in the upstream file and in the web copy at every weight;
        # the glyph outlines, clusters, advances and offsets must be equal.
        # Only then is the file replaced.
        for w in WEB_WEIGHTS:
            if _shape_all(original, cmap, corpus, w) != _shape_all(slim, cmap, corpus, w):
                sys.exit(f'{name}: shaping differs from upstream at wght {w}')
        data = slim
        if manifest:
            data = _woff2(name, slim)
            woff2 = name[:-len('.ttf')] + '.woff2'
            with open(os.path.join(fonts_dir, woff2), 'wb') as fh:
                fh.write(data)
            os.remove(path)
            renamed[name] = woff2
        else:
            with open(path, 'wb') as fh:
                fh.write(slim)
        print(
            f'{name}: opsz pinned at {opsz:g}, {len(src.getGlyphOrder())} -> '
            f'{len(out.getGlyphOrder())} glyphs, {before} -> {len(slim)} bytes'
            f'{f" (WOFF2 {len(data)}, decodes to the same tables)" if manifest else ""}, '
            f'{len(cmap) + len(corpus)} texts x {len(WEB_WEIGHTS)} weights shape the same'
        )
    if manifest:
        # The engine loads exactly the files FontManifest.json names.
        with open(manifest, encoding='utf-8') as fh:
            families = json.load(fh)
        hits = 0
        for family in families:
            for font in family.get('fonts', []):
                base = font['asset'].rsplit('/', 1)[-1]
                if base in renamed:
                    font['asset'] = font['asset'][: -len(base)] + renamed[base]
                    hits += 1
        if hits == 0 or any(
            f['asset'].endswith(tuple(renamed)) for fam in families for f in fam.get('fonts', [])
        ):
            sys.exit(f'{manifest}: the text fonts were not renamed to .woff2')
        with open(manifest, 'w', encoding='utf-8') as fh:
            json.dump(families, fh, separators=(',', ':'))
        print(f'{manifest}: {hits} font entries now name the .woff2 files')


if __name__ == '__main__':
    if len(sys.argv) in (3, 4) and sys.argv[1] == 'web':
        web(sys.argv[2], sys.argv[3] if len(sys.argv) == 4 else None)
        sys.exit(0)
    if len(sys.argv) < 4:
        sys.exit(__doc__)
    main(
        sys.argv[1],
        sys.argv[2],
        None if sys.argv[3] == 'keep' else float(sys.argv[3]),
    )
