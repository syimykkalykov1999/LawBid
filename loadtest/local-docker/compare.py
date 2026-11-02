#!/usr/bin/env python3
"""Markdown table: per-endpoint p50/p95 and errors of two k6 runs (before/after).
   compare.py <results dir before> <results dir after> [min count]"""
import json, os, re, sys

def load(d):
    m = json.load(open(os.path.join(d, 'summary.json')))['metrics']
    out = {}
    for k, v in m.items():
        mm = re.match(r'http_req_duration\{name:(\w+)\}', k)
        if mm and v.get('max', 0) > 0:
            n = mm.group(1)
            out[n] = (m.get(f'http_reqs{{name:{n}}}', {}).get('count', 0), v.get('med', 0), v.get('p(95)', 0),
                      100 * m.get(f'http_req_failed{{name:{n}}}', {}).get('value', 0))
    tot = (m['http_reqs']['count'], m['http_reqs']['rate'], m['http_req_duration']['med'], m['http_req_duration']['p(95)'],
           100 * m['http_req_failed']['value'])
    return out, tot

a, ta = load(sys.argv[1]); b, tb = load(sys.argv[2])
mn = int(sys.argv[3]) if len(sys.argv) > 3 else 1
print(f'| всего | {ta[0]} запр., {ta[1]:.0f}/с | p50 {ta[2]:.0f} / p95 {ta[3]:.0f} мс, ошибок {ta[4]:.2f} % | {tb[0]} запр., {tb[1]:.0f}/с | p50 {tb[2]:.0f} / p95 {tb[3]:.0f} мс, ошибок {tb[4]:.2f} % |')
print('| эндпоинт | запросов до | p50 / p95 до, мс | запросов после | p50 / p95 после, мс |')
print('|---|---:|---:|---:|---:|')
for n in sorted(set(a) | set(b), key=lambda n: -(a.get(n, (0, 0, 0, 0))[2])):
    x = a.get(n); y = b.get(n)
    if (x and x[0] < mn) and (y and y[0] < mn):
        continue
    f = lambda t: f'{t[1]:.0f} / {t[2]:.0f}' + (f' ({t[3]:.1f} % ош.)' if t[3] >= 0.5 else '') if t else '—'
    print(f'| {n} | {x[0] if x else 0} | {f(x)} | {y[0] if y else 0} | {f(y)} |')
