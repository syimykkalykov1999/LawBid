#!/usr/bin/env python3
"""Automatic abort for a k6 run (owner rule: error rate > 5 % or p95 > 2 s
for 60 s -> stop the load).

Polls k6's REST API every 5 s and compares the counters with the ones from
60 s ago, so it judges the LAST minute, not the whole run (k6's own
thresholds are cumulative and would react late to a late failure):

  error rate  = delta(failed_reqs) / delta(tracked_reqs)
  slow share  = delta(slow_reqs)   / delta(tracked_reqs)
                (slow = a request longer than 2 s; "p95 > 2 s" is exactly
                 "more than 5 % of requests are longer than 2 s")
  (counters are ours, loadtest/k6/lib/http.js; k6 shows a Rate only as a ratio)

Needs at least MIN_SAMPLES requests in the window (a quiet moment proves
nothing). On breach: PATCH /v1/status {stopped: true} (k6 finishes, writes
its summary), writes <out>/abort.json, exits 3. Also stops k6 when the wall
clock limit (MAX_SECONDS) is passed. Exits 0 when k6 ends by itself.

usage: guard.py <out-dir> [--api 127.0.0.1:6565]
env:   ABORT_ERROR_RATE=0.05 ABORT_SLOW_SHARE=0.05 ABORT_WINDOW=60
       MIN_SAMPLES=200 POLL=5 MAX_SECONDS=7200
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

OUT = sys.argv[1]
API = "127.0.0.1:6565"
if "--api" in sys.argv:
    API = sys.argv[sys.argv.index("--api") + 1]
ERR = float(os.environ.get("ABORT_ERROR_RATE", "0.05"))
SLOW = float(os.environ.get("ABORT_SLOW_SHARE", "0.05"))
WINDOW = float(os.environ.get("ABORT_WINDOW", "60"))
MIN_SAMPLES = int(os.environ.get("MIN_SAMPLES", "200"))
POLL = float(os.environ.get("POLL", "5"))
MAX_SECONDS = float(os.environ.get("MAX_SECONDS", "7200"))


def call(method, path, body=None, timeout=4):
    req = urllib.request.Request(
        f"http://{API}{path}",
        data=None if body is None else json.dumps(body).encode(),
        method=method,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read() or b"{}")


def counters():
    """(failed, tracked, slow) cumulative counts, or None while k6 starts.
    k6 exposes Counters as {count}; they are ours (lib/http.js)."""
    try:
        data = call("GET", "/v1/metrics")["data"]
    except Exception:
        return None
    by = {m["id"]: m["attributes"]["sample"] for m in data}
    if "tracked_reqs" not in by:
        return None
    return (
        by.get("failed_reqs", {}).get("count", 0),
        by["tracked_reqs"].get("count", 0),
        by.get("slow_reqs", {}).get("count", 0),
    )


def stop(reason, detail):
    print(f"[guard] ABORT: {reason} {json.dumps(detail)}", flush=True)
    with open(os.path.join(OUT, "abort.json"), "w") as fh:
        json.dump({"reason": reason, "detail": detail, "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}, fh)
    for _ in range(3):
        try:
            call(
                "PATCH",
                "/v1/status",
                {"data": {"type": "status", "id": "default", "attributes": {"stopped": True}}},
            )
            break
        except Exception as e:  # k6 may already be gone
            print(f"[guard] stop request failed: {e}", flush=True)
            time.sleep(1)


def main():
    t0 = time.time()
    hist = []  # (t, counters)
    seen_k6 = False
    print(f"[guard] watching k6 on {API}: error>{ERR:.0%} or slow>{SLOW:.0%} over {WINDOW:.0f}s, min {MIN_SAMPLES} requests", flush=True)
    while True:
        time.sleep(POLL)
        now = time.time()
        c = counters()
        if c is None:
            if seen_k6:
                print("[guard] k6 finished", flush=True)
                return 0
            if now - t0 > 300:
                print("[guard] k6 never answered in 5 minutes", flush=True)
                return 0
            continue
        seen_k6 = True
        hist.append((now, c))
        while len(hist) > 1 and now - hist[1][0] >= WINDOW:
            hist.pop(0)
        if now - t0 > MAX_SECONDS:
            stop("wall_clock", {"max_seconds": MAX_SECONDS})
            return 3
        t_old, old = hist[0]
        if now - t_old < WINDOW - POLL:
            continue
        n = c[1] - old[1]
        if n < MIN_SAMPLES:
            continue
        err = (c[0] - old[0]) / n
        slow_n = n
        slow = (c[2] - old[2]) / n
        print(f"[guard] last {now - t_old:.0f}s: {n} requests, errors {err:.1%}, slower than 2s {slow:.1%}", flush=True)
        if err > ERR:
            stop("error_rate", {"window_s": round(now - t_old), "requests": n, "error_rate": round(err, 4)})
            return 3
        if slow > SLOW:
            stop("p95_over_limit", {"window_s": round(now - t_old), "requests": slow_n, "slow_share": round(slow, 4)})
            return 3


sys.exit(main())
