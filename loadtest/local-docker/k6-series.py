#!/usr/bin/env python3
"""Per-10 s time series from a k6 `--out json` stream (stdin) -> CSV (stdout).
   Columns: t, reqs, fails, fail_pct, p50, p95, p99, max, ws_ok, ws_fail, ws_drops,
   chat_n, chat_p95, fail_statuses (status:count;...).  Lines that are not k6 JSON are ignored."""
import sys, json, collections, datetime
B = int(sys.argv[1]) if len(sys.argv) > 1 else 10
def pct(xs, q):
    if not xs: return 0.0
    xs = sorted(xs); k = max(0, min(len(xs) - 1, int(round(q * (len(xs) - 1))))); return xs[k]
def new(): return {'dur': [], 'fails': 0, 'reqs': 0, 'st': collections.Counter(), 'ws_ok': 0, 'ws_fail': 0, 'drops': 0, 'chat': []}
buckets = {}; done = set()
print('t,reqs,fails,fail_pct,p50,p95,p99,max,ws_ok,ws_fail,ws_drops,chat_n,chat_p95,fail_statuses', flush=True)
def flush(upto):
    for t in sorted(k for k in buckets if k < upto):
        b = buckets.pop(t); ts = datetime.datetime.fromtimestamp(t, datetime.timezone.utc).strftime('%H:%M:%S')
        fp = 100.0 * b['fails'] / b['reqs'] if b['reqs'] else 0.0
        st = ';'.join(f'{s}:{n}' for s, n in b['st'].most_common(4))
        print(f"{ts},{b['reqs']},{b['fails']},{fp:.2f},{pct(b['dur'],.5):.0f},{pct(b['dur'],.95):.0f},{pct(b['dur'],.99):.0f},{max(b['dur']) if b['dur'] else 0:.0f},{b['ws_ok']},{b['ws_fail']},{b['drops']},{len(b['chat'])},{pct(b['chat'],.95):.0f},{st}", flush=True)
last = 0
for line in sys.stdin:
    if '"type":"Point"' not in line[:120]: continue
    try: o = json.loads(line)
    except Exception: continue
    m = o['metric']; d = o['data']; s = d['time']
    try:
        t = datetime.datetime.strptime(s[:19], '%Y-%m-%dT%H:%M:%S').replace(tzinfo=datetime.timezone.utc).timestamp()
    except Exception: continue
    k = int(t // B) * B
    if k < last: continue  # late point for a bucket already written
    b = buckets.setdefault(k, new())
    if m == 'http_req_duration': b['dur'].append(d['value']); b['reqs'] += 1
    elif m == 'http_req_failed':
        if d['value']: b['fails'] += 1; b['st'][str(d.get('tags', {}).get('status', '?'))] += 1
    elif m == 'ws_connected':
        if d['value']: b['ws_ok'] += 1
        else: b['ws_fail'] += 1
    elif m == 'ws_unexpected_close': b['drops'] += int(d['value'])
    elif m == 'chat_delivery_ms': b['chat'].append(d['value'])
    if k > last: flush(k); last = k
flush(10**12)
