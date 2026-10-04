"""Builds test/l10n/longest_strings.json for the overflow tests.

For every UI key it keeps the LONGEST translation among the languages the
test fonts can draw (Latin, Cyrillic, Greek scripts), so one test run
covers the worst case of all of them. Placeholders must match English.

Usage: python3 tool/gen_longest_strings.py path/to/lawbid-app-translations.xlsx
"""
import json
import re
import sys

import openpyxl

LANGS = (
    'en ru es fr de it pt nl pl uk tr el cs sk hu ro bg hr sr sl da sv nb fi '
    'ca vi id ms tl ky kk uz ht tk mn be lt lv et mk bs sw af zu yo ig ha ku '
    'eu gl is ga cy mt sq az tg'
).split()
PH = re.compile(r'\{[a-zA-Z0-9_]+\}')

wb = openpyxl.load_workbook(sys.argv[1], read_only=True)
rows = wb.worksheets[0].iter_rows(values_only=True)
header = next(rows)
col = {name: i for i, name in enumerate(header)}
out = {}
for r in rows:
    key, en = r[0], r[col['en']]
    if not key or not en:
        continue
    want = sorted(PH.findall(en))
    best = en
    for lang in LANGS:
        v = r[col[lang]]
        if v and sorted(PH.findall(v)) == want and len(v) > len(best):
            best = v
    out[key] = best
path = 'test/l10n/longest_strings.json'
with open(path, 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, indent=0, sort_keys=True)
print(f'{len(out)} keys -> {path}')
