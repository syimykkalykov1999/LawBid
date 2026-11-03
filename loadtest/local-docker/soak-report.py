#!/usr/bin/env python3
"""Trend of a long run.sh run (soak): soak-report.py <results dir> [minutes per segment=10]
   Throughput / errors / p95 per segment of series.csv, container memory every 5 min,
   Postgres and Redis connections first/last/max, /health/ready samples that were
   not 200. summarize.py prints the totals of the same run."""
import csv, sys, re, collections, os
d = sys.argv[1]; seg_min = int(sys.argv[2]) if len(sys.argv) > 2 else 10
def lines(f):
    try: return open(os.path.join(d, f)).read().splitlines()
    except FileNotFoundError: return []
rows = list(csv.DictReader(open(os.path.join(d, 'series.csv'))))
if not rows: sys.exit('series.csv has no buckets (k6 did not run?)')
n = len(rows); per = seg_min * 6  # 10 s buckets (k6-series.py)
print(f"buckets {n} ({n/6:.0f} min)  first {rows[0]['t']}  last {rows[-1]['t']}")
def seg(rs):
    reqs = sum(int(r['reqs']) for r in rs); fails = sum(int(r['fails']) for r in rs)
    p95 = sorted(int(r['p95']) for r in rs)
    return (f"reqs={reqs:>7} rps={reqs/(10*len(rs)):>4.0f} fails={fails:>5} p95med={p95[len(p95)//2]:>5} p95max={p95[-1]:>6} "
            f"buckets_p95>2s={sum(x > 2000 for x in p95):>2} ws_fail={sum(int(r['ws_fail']) for r in rs):>3} drops={sum(int(r['ws_drops']) for r in rs)}")
for i in range(0, n, per): print(f"  {rows[i]['t']}: {seg(rows[i:i + per])}")
mem = collections.defaultdict(dict)  # container -> HH:MM at :00/:05/... -> memory
for line in lines('stats.log'):
    p = line.split()
    if len(p) >= 4 and p[0][4] in '05': mem[p[1]].setdefault(p[0][:5], p[3])
apis = sorted(k for k in mem if '-api-' in k)
for c in dict.fromkeys(apis[:1] + apis[-1:] + ['lawbid-lt-postgres-1', 'lawbid-lt-redis-1', 'lawbid-lt-worker-1', 'lawbid-lt-pgbouncer-1']):
    if c in mem: print(f"{c.replace('lawbid-lt-',''):11}", ' '.join(f"{k}={v}" for k, v in sorted(mem[c].items())))
pg = [(int(a), int(t)) for a, t in re.findall(r' pg (\d+)\|(\d+)', '\n'.join(lines('pg.log')))]
if pg: print(f"pg connections active|total first {pg[0][0]}|{pg[0][1]} last {pg[-1][0]}|{pg[-1][1]} max active {max(a for a, _ in pg)} max total {max(t for _, t in pg)}")
rd = re.findall(r'connected_clients:(\d+)', '\n'.join(lines('redis.log')))
if rd: print('redis clients first/last/max:', rd[0], rd[-1], max(map(int, rd)))
bad = [l for l in lines('health.log') if ' ready 200 ' not in l]
print('ready non-200 samples:', len(bad), (bad[-1][:50] if bad else ''))
