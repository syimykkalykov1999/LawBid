#!/usr/bin/env python3
"""Per-10 s time series from a k6 `--out json` stream (stdin) -> CSV (stdout).
   Columns: t (host local time), reqs, fails, fail_pct, p50, p95, p99, max,
   ws_ok, ws_fail, ws_drops, chat_n, chat_p95, fail_statuses (status:count;...).
   Lines that are not k6 JSON (the end-of-test summary) are passed to stderr.
   k6 flushes points in ~1 s batches that are not ordered in time, so a bucket is
   written only once a point of the bucket after the next one has arrived."""
import sys, json, collections, datetime, re
B = 10
WANT = ('http_req_duration', 'http_req_failed', 'ws_connected', 'ws_unexpected_close', 'chat_delivery_ms')
# k6 2.0 writes {"metric":"<name>","type":"Point",...}: a prefix test skips the
# ~80 % of lines (other metrics) without parsing them
PREFIXES = tuple(f'{{"metric":"{m}","type":"Point"' for m in WANT)
def new(): return {'dur': [], 'fails': 0, 'reqs': 0, 'st': collections.Counter(), 'ws_ok': 0, 'ws_fail': 0, 'drops': 0, 'chat': []}
def pct(xs, q): return xs[round(q * (len(xs) - 1))] if xs else 0.0  # xs sorted
buckets = {}
print('t,reqs,fails,fail_pct,p50,p95,p99,max,ws_ok,ws_fail,ws_drops,chat_n,chat_p95,fail_statuses', flush=True)
def flush(upto):
    for t in sorted(k for k in buckets if k < upto):
        b = buckets.pop(t); ts = datetime.datetime.fromtimestamp(t).strftime('%H:%M:%S')
        dur = sorted(b['dur']); chat = sorted(b['chat'])
        fp = 100.0 * b['fails'] / b['reqs'] if b['reqs'] else 0.0
        st = ';'.join(f'{s}:{n}' for s, n in b['st'].most_common(4))
        print(f"{ts},{b['reqs']},{b['fails']},{fp:.2f},{pct(dur,.5):.0f},{pct(dur,.95):.0f},{pct(dur,.99):.0f},{dur[-1] if dur else 0:.0f},{b['ws_ok']},{b['ws_fail']},{b['drops']},{len(chat)},{pct(chat,.95):.0f},{st}", flush=True)
seconds = {}  # "2026-11-02T21:26:39" -> epoch: thousands of points share one second
def epoch(s):
    k = s[:19]
    if k not in seconds:  # k6 writes 9 fraction digits; fromisoformat takes 6
        seconds[k] = datetime.datetime.fromisoformat(re.sub(r'(\.\d{1,6})\d*', r'\1', s)).timestamp()
    return seconds[k]
last = 0
for line in sys.stdin:
    if not line.startswith(PREFIXES):
        if not line.startswith('{'): sys.stderr.write(line)
        continue
    o = json.loads(line); m = o['metric']; d = o['data']
    k = int(epoch(d['time']) // B) * B
    if k < last - B: continue  # older than the one-bucket lag: already written
    if k > last: flush(k - B); last = k
    b = buckets.setdefault(k, new())
    if m == 'http_req_duration': b['dur'].append(d['value']); b['reqs'] += 1
    elif m == 'http_req_failed':
        if d['value']: b['fails'] += 1; b['st'][str(d.get('tags', {}).get('status', '?'))] += 1
    elif m == 'ws_connected':
        if d['value']: b['ws_ok'] += 1
        else: b['ws_fail'] += 1
    elif m == 'ws_unexpected_close': b['drops'] += int(d['value'])
    else: b['chat'].append(d['value'])
flush(10**12)
