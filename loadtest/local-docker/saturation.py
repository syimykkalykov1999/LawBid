#!/usr/bin/env python3
"""Verdict of one open-model rung: did the SERVER miss the rate, or did the laptop itself run out?

usage: saturation.py <results dir> <target rps>
exit 0  the rung held (rate delivered, errors/p95 inside the stop rules)
exit 10 the rung missed: prints "ceiling = <delivered> rps, bottleneck: <what>"
Sources: summary.json (k6 --summary-export), stats.log (docker stats, one line per container per 10 s),
pg.log (connections). Above the laptop's own limit the numbers say nothing about production
(docs/perf/LOAD_STEPS_2026-11-02.md): bottleneck 'k6 generator' / 'laptop CPU' means exactly that.
"""
import json
import os
import re
import sys
from collections import defaultdict

res, target = sys.argv[1], float(sys.argv[2])
try:
    s = json.load(open(os.path.join(res, "summary.json")))["metrics"]
except (OSError, ValueError, KeyError):
    print("ceiling = unknown, bottleneck: no summary.json (k6 did not finish)")
    sys.exit(10)


def val(metric, key):
    return (s.get(metric) or {}).get(key, (s.get(metric) or {}).get("values", {}).get(key))


reqs_rate = val("http_reqs", "rate") or 0.0
fail = val("http_req_failed", "value") or val("http_req_failed", "rate") or 0.0
p95 = val("http_req_duration", "p(95)") or 0.0
dropped = val("dropped_iterations", "count") or 0

# average CPU per container (docker stats: "HH:MM:SS name 123.4% mem")
cpu = defaultdict(list)
try:
    for line in open(os.path.join(res, "stats.log")):
        m = re.match(r"\S+ (\S+) ([\d.]+)%", line)
        if m:
            cpu[re.sub(r"-\d+$", "", m.group(1))].append(float(m.group(2)))
except OSError:
    pass
avg = {k: sum(v) / len(v) for k, v in cpu.items() if v}
ncpu = os.cpu_count() or 1


def top(prefix):
    xs = [(k, v) for k, v in avg.items() if prefix in k]
    return max(xs, key=lambda kv: kv[1]) if xs else (prefix, 0.0)


k6 = sum(v for k, v in avg.items() if "k6" in k)
api = sum(v for k, v in avg.items() if "api" in k)
total = sum(avg.values())
held = dropped == 0 and reqs_rate >= 0.95 * target and fail < 0.01 and p95 < 800
print(f"target {target:.0f} rps, delivered {reqs_rate:.0f} rps, errors {fail*100:.2f} %, p95 {p95:.0f} ms, dropped iterations {dropped}")
print("cpu %% (sum of containers): k6 %.0f, api %.0f, total %.0f of %d" % (k6, api, total, ncpu * 100))
if held:
    sys.exit(0)
if total >= 0.9 * ncpu * 100:
    why = "laptop CPU (every core busy: generator + server share it; above this the numbers say nothing about production)"
elif k6 >= 0.8 * 100 * max(1, ncpu // 3):
    why = "k6 generator (the load tool is the limit, not the server)"
else:
    name, v = top("postgres")
    rname, rv = top("redis")
    if v >= 90:
        why = f"database CPU ({name} {v:.0f} %): query or index, see pgss_top.txt"
    elif rv >= 90:
        why = f"Redis CPU ({rname} {rv:.0f} %)"
    elif api >= 0.8 * 100 * 16:
        why = "API replicas CPU (all busy): more replicas or code cost per request"
    else:
        why = "not CPU: locks, connection pool or a queue; see pg.log (connections), pg-slow.log, health.log"
print(f"ceiling = {reqs_rate:.0f} rps, bottleneck: {why}")
sys.exit(10)
