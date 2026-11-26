#!/usr/bin/env python3
"""Refit the admin Lighthouse CPU table (apps/admin/lighthouse-cpu.cjs, KNOWN_ERRORS 261).

Input: a folder with one sub-folder per admin-ci job, each holding that job's
`admin-lighthouse` artifact (lhr-*.json), e.g.

    for id in $(gh api 'repos/<owner>/<repo>/actions/artifacts?name=admin-lighthouse&per_page=100' \
                  -q '.artifacts[].id'); do
      mkdir -p jobs/$id && gh api repos/<owner>/<repo>/actions/artifacts/$id/zip > jobs/$id/a.zip \
        && unzip -q -o jobs/$id/a.zip 'lhr-*.json' -d jobs/$id && rm jobs/$id/a.zip
    done
    python3 scripts/ci/lighthouse-cpu-fit.py jobs

Method (no tuning knobs beyond the reference):
  * drop the cold first run of each page in each job;
  * unthrottled main-thread work of a report = mainthread-work-breakdown / the
    multiplier it ran with (Lighthouse's simulated main-thread time scales with
    cpuSlowdownMultiplier), normalised per page by the page's median on
    2850-3050 runners (the reference: x4 on benchmarkIndex 2950);
  * per 100-BI bin with >= 15 reports: the multiplier that gives the
    reference work = 4 / median(work);
  * weighted isotonic (non-decreasing) fit over the bins (pool adjacent
    violators). Printed: the knots, per-bin residuals, and the weighted RMS of
    the table, of a power law through the reference, and of the docs'
    calculator curve that #1358 used.
"""
import collections
import glob
import json
import math
import os
import statistics as st
import sys

REF_BAND = (2850, 3050)
MIN_BIN = 15


def load(root):
    reports = collections.defaultdict(list)
    for f in glob.glob(os.path.join(root, '*', 'lhr-*.json')):
        j = json.load(open(f))
        page = j['finalDisplayedUrl'].split('://', 1)[-1].split('/', 1)[-1]
        reports[(os.path.basename(os.path.dirname(f)), page)].append(dict(
            page=page,
            bi=j['environment']['benchmarkIndex'],
            m=j['configSettings']['throttling']['cpuSlowdownMultiplier'],
            tbt=j['audits']['total-blocking-time']['numericValue'],
            mw=j['audits']['mainthread-work-breakdown']['numericValue'],
            t=j['fetchTime'],
        ))
    out = []
    for v in reports.values():
        v.sort(key=lambda d: d['t'])
        out += v[1:]
    return out


def isotonic(points):
    blocks = [[y, w, [x]] for x, y, w in points]
    i = 0
    while i < len(blocks) - 1:
        if blocks[i][0] > blocks[i + 1][0]:
            a, b = blocks[i], blocks.pop(i + 1)
            blocks[i] = [(a[0] * a[1] + b[0] * b[1]) / (a[1] + b[1]), a[1] + b[1], a[2] + b[2]]
            i = max(i - 1, 0)
        else:
            i += 1
    knots = sorted({(x, round(y, 2)) for y, _, xs in blocks for x in (min(xs), max(xs))})
    return knots


def interp(knots, bi):
    if bi <= knots[0][0]:
        return knots[0][1]
    if bi >= knots[-1][0]:
        return knots[-1][1]
    for (x0, y0), (x1, y1) in zip(knots, knots[1:]):
        if x0 <= bi <= x1:
            return y0 if x1 == x0 else y0 + (y1 - y0) * (bi - x0) / (x1 - x0)


def main(root):
    rs = load(root)
    pages = sorted({d['page'] for d in rs})
    ref = {p: st.median(d['mw'] / d['m'] for d in rs if d['page'] == p and REF_BAND[0] <= d['bi'] < REF_BAND[1])
           for p in pages}
    bins = collections.defaultdict(list)
    for d in rs:
        bins[int(d['bi'] // 100 * 100)].append(d['mw'] / d['m'] / ref[d['page']])
    points = [(b + 50, 4 / st.median(v), len(v)) for b, v in sorted(bins.items()) if len(v) >= MIN_BIN]
    knots = isotonic(points)
    num = sum(w * math.log(x / 2950) * math.log(y / 4) for x, y, w in points)
    k = num / sum(w * math.log(x / 2950) ** 2 for x, _, w in points)
    calc = lambda bi: 4 * (3 + (bi - 1300) / 233) / (3 + (2950 - 1300) / 233)  # noqa: E731
    print(f'{len(rs)} reports, pages: {pages}')
    print('knots:', json.dumps([[x, y] for x, y in knots]))
    print('  bin     n  needed  table(res%)')
    sq = collections.Counter()
    total = 0
    for x, y, w in points:
        t = interp(knots, x)
        print(f'{x:5.0f} {w:5d}  {y:5.2f}  {t:5.2f} ({100 * (y / t - 1):+5.1f})')
        sq['table'] += w * math.log(y / t) ** 2
        sq['power'] += w * math.log(y / (4 * (x / 2950) ** k)) ** 2
        sq['calculator'] += w * math.log(y / calc(x)) ** 2
        total += w
    for name in ('table', 'power', 'calculator'):
        print(f'weighted RMS residual {name}: {100 * math.sqrt(sq[name] / total):.1f} %'
              + (f' (k = {k:.3f})' if name == 'power' else ''))


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'jobs')
