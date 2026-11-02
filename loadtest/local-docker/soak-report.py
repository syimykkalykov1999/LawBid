#!/usr/bin/env python3
"""Short progress report of a resilience.sh run: soak-report.py <results dir> [minutes per segment=10]
   Throughput / errors / p95 per segment, container memory every 5 min, DB and Redis connections."""
import csv, sys, re, collections, os
d = sys.argv[1]; seg_min = int(sys.argv[2]) if len(sys.argv) > 2 else 10
rows = list(csv.DictReader(open(os.path.join(d, 'series.csv'))))
n = len(rows); per = seg_min * 6
print(f"buckets {n} ({n/6:.0f} min)  first {rows[0]['t']}  last {rows[-1]['t']}  (UTC)")
def seg(a, b):
    rs = rows[a:b]; reqs = sum(int(r['reqs']) for r in rs); fails = sum(int(r['fails']) for r in rs)
    p95 = sorted(int(r['p95']) for r in rs); bad = sum(1 for r in rs if int(r['p95']) > 2000)
    return (f"reqs={reqs:>7} rps={reqs/max(1,10*len(rs)):>4.0f} fails={fails:>5} p95med={p95[len(p95)//2]:>5} p95max={p95[-1]:>6} "
            f"buckets_p95>2s={bad:>2} ws_fail={sum(int(r['ws_fail']) for r in rs):>3} drops={sum(int(r['ws_drops']) for r in rs)}")
for i in range(0, n, per): print(f"  {rows[i]['t']}: {seg(i, min(n, i + per))}")
mem = collections.defaultdict(dict)
for line in open(os.path.join(d, 'stats.log')):
    p = line.split()
    if len(p) < 4: continue
    t = p[0][:5]
    if t[-1] in '05' and t not in mem[p[1]]: mem[p[1]][t] = p[3]
apis = sorted(k for k in mem if '-api-' in k)
for c in apis[:1] + apis[-1:] + ['lawbid-lt-postgres-1', 'lawbid-lt-redis-1', 'lawbid-lt-worker-1', 'lawbid-lt-pgbouncer-1']:
    if c in mem: print(f"{c.replace('lawbid-lt-',''):11}", ' '.join(f"{k}={v}" for k, v in sorted(mem[c].items())))
S = open(os.path.join(d, 'sample.log')).read().splitlines()
pg = [l.split()[2] for l in S if ' pg ' in l and '|' in l]; rd = [re.search(r'connected_clients:(\d+)', l) for l in S if ' redis ' in l]
rd = [m.group(1) for m in rd if m]
if pg: print('pg connections active|total first/last:', pg[0], pg[-1], ' max total:', max(int(x.split('|')[1]) for x in pg), ' max active:', max(int(x.split('|')[0]) for x in pg))
if rd: print('redis clients first/last/max:', rd[0], rd[-1], max(map(int, rd)))
bad = [l for l in S if ' ready ' in l and not re.search(r'ready 200 ', l)]
print('ready non-200 samples:', len(bad), (bad[-1][:40] if bad else ''))
