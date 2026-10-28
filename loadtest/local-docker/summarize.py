#!/usr/bin/env python3
"""Short table from a k6 --summary-export file (vus.js runs) + sampler logs.
   summarize.py <results dir>"""
import json, re, sys, os, collections
d = sys.argv[1]
s = json.load(open(os.path.join(d, 'summary.json')))
m = s['metrics']
def g(name, k, default=None):
    x = m.get(name)
    return x.get(k, default) if x else default
reqs = g('http_reqs', 'count', 0); rate = g('http_reqs', 'rate', 0)
print(f"requests {reqs}  {rate:.0f} req/s  errors {100*g('http_req_failed','value',0):.2f}%  iterations {g('iterations','count',0)}  vus_max {g('vus_max','value')}")
print(f"http  p50 {g('http_req_duration','med',0):.0f}  p95 {g('http_req_duration','p(95)',0):.0f}  p99 {g('http_req_duration','p(99)',0):.0f}  max {g('http_req_duration','max',0):.0f} ms")
for k in ('ws_connect_ms', 'chat_delivery_ms'):
    if k in m: print(f"{k}  p50 {g(k,'med',0):.0f}  p95 {g(k,'p(95)',0):.0f}  p99 {g(k,'p(99)',0):.0f}")
for k in ('ws_connected', 'room_join_ok', 'chat_delivered'):
    if k in m: print(f"{k} {100*g(k,'value',0):.1f}%")
if 'api_429' in m: print(f"429s {g('api_429','count')}")
rows = []
for k, v in m.items():
    mm = re.match(r'http_req_duration\{name:(\w+)\}', k)
    if mm and v.get('max', 0) > 0:
        n = mm.group(1)
        cnt = m.get(f'http_reqs{{name:{n}}}', {}).get('count', 0)
        err = m.get(f'http_req_failed{{name:{n}}}', {}).get('value', 0)
        rows.append((v.get('p(95)', 0), n, cnt, err, v.get('med', 0), v.get('p(99)', 0)))
print(f"{'endpoint':18} {'count':>8} {'err%':>6} {'p50':>6} {'p95':>6} {'p99':>6}")
for p95, n, cnt, err, med, p99 in sorted(rows, reverse=True):
    print(f"{n:18} {cnt:8} {100*err:6.2f} {med:6.0f} {p95:6.0f} {p99:6.0f}")
# resources: max CPU% / mem per container
mx = collections.defaultdict(lambda: [0.0, ''])
try:
    for line in open(os.path.join(d, 'stats.log')):
        p = line.split()
        if len(p) < 4: continue
        c = float(p[2].rstrip('%'))
        if c > mx[p[1]][0]: mx[p[1]] = [c, p[3]]
    print('peak CPU% (100 = one core) / mem:', ', '.join(f"{k.replace('lawbid-lt-','')} {v[0]:.0f}% {v[1]}" for k, v in sorted(mx.items())))
except FileNotFoundError: pass
for f, rx in (('pg.log', r'pg (\d+)\|(\d+)'),):
    try:
        a = [tuple(map(int, re.search(rx, l).groups())) for l in open(os.path.join(d, f)) if re.search(rx, l)]
        print(f"postgres connections peak active {max(x[0] for x in a)} total {max(x[1] for x in a)}")
    except Exception: pass
try:
    t = [int(re.search(r'\+?(\d+)', l.split('temp')[1]).group(1)) for l in open(os.path.join(d, 'temp.log')) if re.search(r'\d', l.split('temp')[1])]
    print(f"cpu package temp peak {max(t)} C (samples every 10 s)")
except Exception: pass
try:
    r = open(os.path.join(d, 'redis.log')).read().splitlines()[-1]; print('redis', r.split('redis', 1)[1].strip())
except Exception: pass
