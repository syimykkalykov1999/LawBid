"""Builds test/l10n/longest_strings.json for the overflow tests.

For every UI key it keeps the LONGEST translation among the languages the
test fonts can draw (Latin, Cyrillic, Greek scripts), so one test run
covers the worst case of all of them. Placeholders must match English.

Usage: python3 tool/gen_longest_strings.py lawbid-app-translations.xlsx [*-keys-update.xlsx ...]

Update workbooks are applied in order on top of the main one (a later
row for the same key wins), as the admin import does.
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

rows_by_key = {}
for file in sys.argv[1:]:
    wb = openpyxl.load_workbook(file, read_only=True)
    rows = wb.worksheets[0].iter_rows(values_only=True)
    header = next(rows)
    col = {name: i for i, name in enumerate(header)}
    for r in rows:
        if r and r[0]:
            rows_by_key[r[0]] = {lang: r[i] for lang, i in col.items()}
out = {}
for key, r in rows_by_key.items():
    en = r.get('en')
    if not en:
        continue
    want = sorted(PH.findall(en))
    best = en
    for lang in LANGS:
        v = r.get(lang)
        if v and sorted(PH.findall(v)) == want and len(v) > len(best):
            best = v
    out[key] = best
path = 'test/l10n/longest_strings.json'
with open(path, 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, indent=0, sort_keys=True)
print(f'{len(out)} keys -> {path}')
