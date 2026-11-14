#!/usr/bin/env python3
"""Combat-run watcher (owner row 59, docs/dev/AWS_COMBAT_TEST_PLAN_2026-11-13.md).

Runs on the GitHub runner beside the load of profile `combat` (started in the
background by .github/workflows/load-test.yml, like cost-guard.py). Read-only
except for one thing: on a hard-stop rule it cancels THIS GitHub run, and the
workflow's always() steps destroy the stack (the same path as cost-guard.py).

Every POLL seconds it records one line of what the automation is doing:
  * ECS api / worker / pgbouncer: desired, running, pending, capacity provider
    strategy, running tasks per provider (FARGATE vs FARGATE_SPOT);
  * the database (class, status, Multi-AZ) and Redis (node type, status);
  * ALB requests and 5xx (target + balancer) of the last 2 minutes;
  * scaling activities of the PROD api service (read-only, application
    autoscaling): the LawBid/Runtime OpenSockets metric has no environment
    dimension, so load-test sockets can move prod's socket policy - we record it.

Hard-stop rules (owner row 59):
  * 5xx > 1 % of ALB requests over the last 2 minutes (at least MIN_REQUESTS);
  * the test database or Redis is deleting / gone / failed (a data-tier destroy);
  * the wall clock limit MAX_SECONDS.
Spend > $40 is cost-guard.py (confirm_cost = 40).

On SIGTERM / SIGINT (the workflow stops it after the load) it writes
<out>/combat.md and <out>/combat-summary.json: did every part go UP and come back
DOWN, and when.

usage: combat-watch.py <stack.json> <out-dir> [--once]
env:   AWS_REGION, POLL=30, MAX_SECONDS=7200, ABORT_5XX=0.01, MIN_REQUESTS=500,
       PROD_CLUSTER=lawbid-prod PROD_API_SERVICE=api (read-only),
       GITHUB_RUN_ID + GH_TOKEN (to cancel), DRY=1 (never cancel; tests)
"""
import datetime as dt
import importlib.util
import json
import os
import signal
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
BAD_DB = {"deleting", "failed", "incompatible-restore", "incompatible-parameters", "storage-full", "inaccessible-encryption-credentials"}
BAD_REDIS = {"deleting", "create-failed", "deleted"}
SERVICES = ("api", "worker", "pgbouncer")


def _cost_guard():
    """cancel_run() and aws() are the money guard's own (one implementation)."""
    spec = importlib.util.spec_from_file_location("cost_guard", os.path.join(HERE, "cost-guard.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# ------------------------------------------------------------------ pure parts
def ratio_5xx(requests, target_5xx, elb_5xx, min_requests):
    """Share of 5xx answers, or None when there were too few requests to judge."""
    if requests < min_requests:
        return None
    return (target_5xx + elb_5xx) / requests


def data_tier_breach(db, redis):
    """A reason string when the test database or Redis is being destroyed, else None.
    db / redis: {"status": ...} or None when the describe call found nothing."""
    if db is None:
        return "database is gone"
    if str(db.get("status", "")).lower() in BAD_DB:
        return f"database status {db['status']}"
    if redis is None:
        return "redis is gone"
    if str(redis.get("status", "")).lower() in BAD_REDIS:
        return f"redis status {redis['status']}"
    return None


def summarize(lines, load_end_at=None):
    """What went up, what came back down. lines = the timeline samples."""
    out = {"samples": len(lines), "services": {}, "database": {}, "redis": {}, "alb": {}, "prod": {}}
    if not lines:
        return out
    for svc in SERVICES:
        seq = [ln["ecs"].get(svc) for ln in lines if ln.get("ecs", {}).get(svc)]
        if not seq:
            continue
        start = seq[0]["desired"]
        peak = max(s["desired"] for s in seq)
        end = seq[-1]["desired"]
        peak_at = next(ln["t"] for ln in lines if ln.get("ecs", {}).get(svc, {}).get("desired") == peak)
        back_at = None
        if peak > start:
            after = [ln for ln in lines if ln["t"] > peak_at and ln.get("ecs", {}).get(svc, {}).get("desired", peak) <= start]
            back_at = after[0]["t"] if after else None
        strategies = []
        for s in seq:
            k = "spot" if any(p.get("provider") == "FARGATE_SPOT" and p.get("weight", 0) > 0 for p in s.get("strategy", [])) else ("regular" if s.get("strategy") else "launch_type")
            if not strategies or strategies[-1] != k:
                strategies.append(k)
        spot_max = max(s.get("on_spot", 0) for s in seq)
        out["services"][svc] = {
            "start": start, "peak": peak, "peak_at": peak_at, "end": end,
            "scaled_out": peak > start, "back_to_start": end <= start, "back_at": back_at,
            "strategy_changes": strategies, "fallback_seen": "regular" in strategies[1:] if strategies else False,
            "max_tasks_on_spot": spot_max,
        }
    for key in ("database", "redis"):
        cls = [ln[key]["class"] for ln in lines if ln.get(key) and ln[key].get("class")]
        if cls:
            changes = [cls[0]] + [c for i, c in enumerate(cls[1:], 1) if c != cls[i - 1]]
            out[key] = {"classes": changes, "grew": len(changes) > 1, "end": cls[-1], "back_to_start": cls[-1] == cls[0]}
    ratios = [ln["alb"]["ratio_5xx"] for ln in lines if ln.get("alb", {}).get("ratio_5xx") is not None]
    out["alb"] = {"max_ratio_5xx": max(ratios) if ratios else None, "judged_windows": len(ratios)}
    acts = {}
    for ln in lines:
        for a in ln.get("prod_activities", []):
            acts[a["id"]] = a
    out["prod"] = {"api_scaling_activities": sorted(acts.values(), key=lambda a: a["start"])}
    return out


def render(summary):
    """The plain report block (combat.md) appended to the run's report."""
    yes = lambda b: "YES" if b else "NO"  # noqa: E731
    rows = ["## Combat run: automation up and down (owner row 59)", "",
            "| Part | start | peak (at) | end | went up | back down (at) | Spot / regular |", "|---|---:|---|---:|---|---|---|"]
    for svc, s in summary["services"].items():
        rows.append(f"| ECS {svc} tasks | {s['start']} | {s['peak']} ({s['peak_at']}) | {s['end']} | {yes(s['scaled_out'])} | "
                    f"{yes(s['back_to_start'])}{' (' + s['back_at'] + ')' if s['back_at'] else ''} | {' -> '.join(s['strategy_changes'])}, max {s['max_tasks_on_spot']} on Spot |")
    for key in ("database", "redis"):
        d = summary.get(key) or {}
        if d:
            rows.append(f"| {key} size | {d['classes'][0]} | {' -> '.join(d['classes'])} | {d['end']} | {yes(d['grew'])} | {yes(d['back_to_start'])} | |")
    m = summary["alb"].get("max_ratio_5xx")
    rows += ["", f"Worst 2-minute 5xx share at the ALB: {'n/a' if m is None else f'{m * 100:.2f} %'} (stop rule 1 %), {summary['alb']['judged_windows']} windows judged."]
    acts = summary["prod"]["api_scaling_activities"]
    rows.append(f"PROD api scaling activities during the run (shared OpenSockets metric, read-only): {len(acts)}.")
    for a in acts[:10]:
        rows.append(f"- {a['start']} {a['status']}: {a['description'][:160]}")
    return "\n".join(rows) + "\n"


# -------------------------------------------------------------- AWS reading
class Reader:
    def __init__(self, stack, aws):
        self.s = stack
        self.aws = aws
        self.cluster = stack["cluster_name"]
        self.names = {"api": stack.get("api_service_name"), "worker": stack.get("worker_service_name"), "pgbouncer": stack.get("pgbouncer_service_name")}

    def ecs(self):
        names = [n for n in self.names.values() if n]
        d = self.aws("ecs", "describe-services", "--cluster", self.cluster, "--services", *names)
        out = {}
        for svc in d.get("services", []):
            key = next(k for k, v in self.names.items() if v == svc["serviceName"])
            on = {"FARGATE": 0, "FARGATE_SPOT": 0}
            arns = self.aws("ecs", "list-tasks", "--cluster", self.cluster, "--service-name", svc["serviceName"], "--desired-status", "RUNNING").get("taskArns", [])
            for i in range(0, len(arns), 100):
                for t in self.aws("ecs", "describe-tasks", "--cluster", self.cluster, "--tasks", *arns[i:i + 100]).get("tasks", []):
                    on[t.get("capacityProviderName") or "FARGATE"] = on.get(t.get("capacityProviderName") or "FARGATE", 0) + 1
            out[key] = {
                "desired": svc.get("desiredCount", 0), "running": svc.get("runningCount", 0), "pending": svc.get("pendingCount", 0),
                "strategy": [{"provider": p["capacityProvider"], "base": p.get("base", 0), "weight": p.get("weight", 0)} for p in svc.get("capacityProviderStrategy", [])],
                "deployments": len(svc.get("deployments", [])), "on_spot": on.get("FARGATE_SPOT", 0), "on_regular": on.get("FARGATE", 0),
            }
        return out

    def database(self):
        try:
            d = self.aws("rds", "describe-db-instances", "--db-instance-identifier", self.s["database_instance_id"])
        except RuntimeError as ex:
            if "DBInstanceNotFound" in str(ex):
                return None
            raise
        i = (d.get("DBInstances") or [None])[0]
        if i is None:
            return None
        return {"class": i["DBInstanceClass"], "status": i["DBInstanceStatus"], "multi_az": i.get("MultiAZ"), "pending": bool(i.get("PendingModifiedValues"))}

    def redis(self):
        try:
            d = self.aws("elasticache", "describe-replication-groups", "--replication-group-id", self.s["redis_replication_group_id"])
        except RuntimeError as ex:
            if "ReplicationGroupNotFound" in str(ex):
                return None
            raise
        g = (d.get("ReplicationGroups") or [None])[0]
        if g is None:
            return None
        return {"class": g.get("CacheNodeType"), "status": g.get("Status"), "failover": g.get("AutomaticFailover")}

    def alb(self, min_requests):
        end = dt.datetime.now(dt.timezone.utc).replace(second=0, microsecond=0)
        start = end - dt.timedelta(minutes=2)
        q = []
        for i, m in enumerate(("RequestCount", "HTTPCode_Target_5XX_Count", "HTTPCode_ELB_5XX_Count")):
            q.append({"Id": f"m{i}", "MetricStat": {"Metric": {"Namespace": "AWS/ApplicationELB", "MetricName": m, "Dimensions": [{"Name": "LoadBalancer", "Value": self.s["alb_arn_suffix"]}]}, "Period": 120, "Stat": "Sum"}})
        d = self.aws("cloudwatch", "get-metric-data", "--start-time", start.isoformat(), "--end-time", end.isoformat(), "--metric-data-queries", json.dumps(q))
        v = {r["Id"]: sum(r.get("Values", [])) for r in d.get("MetricDataResults", [])}
        req, t5, e5 = v.get("m0", 0), v.get("m1", 0), v.get("m2", 0)
        return {"requests": req, "target_5xx": t5, "elb_5xx": e5, "ratio_5xx": ratio_5xx(req, t5, e5, min_requests)}

    def prod_activities(self, since):
        cl, sv = os.environ.get("PROD_CLUSTER", "lawbid-prod"), os.environ.get("PROD_API_SERVICE", "api")
        d = self.aws("application-autoscaling", "describe-scaling-activities", "--service-namespace", "ecs", "--resource-id", f"service/{cl}/{sv}", "--max-results", "20")
        out = []
        for a in d.get("ScalingActivities", []):
            if str(a.get("StartTime", "")) >= since:
                out.append({"id": a["ActivityId"], "start": str(a["StartTime"])[:19], "status": a.get("StatusCode", ""), "description": a.get("Description", "")})
        return out


def main():
    stack_file, out_dir = sys.argv[1], sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)
    with open(stack_file) as fh:
        stack = json.load(fh)
    name = str(stack.get("name", ""))
    if "loadtest" not in name:
        print(f"combat-watch: REFUSING: stack name {name!r} is not a load-test stack", flush=True)
        return 5
    cg = _cost_guard()
    reader = Reader(stack, cg.aws)
    poll = float(os.environ.get("POLL", "30"))
    max_s = float(os.environ.get("MAX_SECONDS", "7200"))
    abort_5xx = float(os.environ.get("ABORT_5XX", "0.01"))
    min_req = int(os.environ.get("MIN_REQUESTS", "500"))
    started = time.time()
    since = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    lines = []
    timeline = open(os.path.join(out_dir, "combat-timeline.jsonl"), "a")

    stopped = []

    def finish(*_):
        s = summarize(lines)
        s["hard_stop"] = stopped[0] if stopped else None
        with open(os.path.join(out_dir, "combat-summary.json"), "w") as fh:
            json.dump(s, fh, indent=1)
        with open(os.path.join(out_dir, "combat.md"), "w") as fh:
            if stopped:  # load-test.yml reads "**Verdict: ABORTED" from the report
                fh.write(f"\n**Verdict: ABORTED by the combat watcher ({stopped[0]}, owner row 59 stop rules)**\n\n")
            fh.write(render(s))
        print("combat-watch: summary written", flush=True)
        sys.exit(0)

    def stop(reason, detail):
        if stopped:
            return
        stopped.append(reason)
        print(f"::error::combat-watch: HARD STOP: {reason} {json.dumps(detail)}", flush=True)
        with open(os.path.join(out_dir, "combat-abort.json"), "w") as fh:
            json.dump({"reason": reason, "detail": detail, "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}, fh)
        if os.environ.get("DRY") != "1":
            cg.cancel_run()

    signal.signal(signal.SIGTERM, finish)
    signal.signal(signal.SIGINT, finish)
    once = "--once" in sys.argv
    while True:
        ln = {"t": time.strftime("%H:%M:%S", time.gmtime()), "s": round(time.time() - started)}
        for key, fn in (("ecs", reader.ecs), ("database", reader.database), ("redis", reader.redis), ("alb", lambda: reader.alb(min_req)), ("prod_activities", lambda: reader.prod_activities(since))):
            try:
                ln[key] = fn()
            except Exception as ex:  # noqa: BLE001 - one failed read is a gap, not a stop
                ln[key + "_error"] = str(ex)[:200]
        lines.append(ln)
        timeline.write(json.dumps(ln) + "\n")
        timeline.flush()
        if "database" in ln and "redis" in ln:
            why = data_tier_breach(ln["database"], ln["redis"])
            if why:
                stop("data_tier", {"why": why})
        r = (ln.get("alb") or {}).get("ratio_5xx")
        if r is not None and r > abort_5xx:
            stop("5xx", {"ratio": round(r, 4), "limit": abort_5xx, "alb": ln["alb"]})
        if time.time() - started > max_s:
            stop("wall_clock", {"seconds": max_s})
        if once:
            print(json.dumps(ln, indent=1))
            finish()
        time.sleep(poll)


if __name__ == "__main__":
    sys.exit(main())
