#!/usr/bin/env python3
"""Money guard of a load-test run: the spending limit is an INPUT, not a reminder.

Every POLL seconds it adds up what the stack of THIS run costs per hour right now
(what is really running: Fargate tasks, database, Redis, generators, balancer,
NAT ...; list prices from loadtest/prices.json) and accumulates dollars. Per-use
items (CloudFront, WAF, transfer) are added from the estimate of the profile,
prorated by time. At 80 % of the limit it warns; at 100 % it cancels the GitHub
run: the workflow's `always()` steps then DESTROY the stack (same path as any
failed run), and the hourly watchdog is the next net.

If it cannot read AWS (any single failure) it falls back to the profile's estimated
hourly burn x 1.5 (pessimistic) - it never goes blind and quiet. A reading that
succeeds but is below 40 % of the profile's average burn is treated as incomplete
(an unpriced or not-yet-tagged resource) and raised to that floor.

usage: cost-guard.py <limit-usd> <profile> [--once]   (--once: print the burn and exit)
env:   RUN_ID (tag RunId), AWS_REGION, GITHUB_RUN_ID + GH_TOKEN (to cancel), POLL=60
"""
import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PRICES = json.load(open(os.path.join(ROOT, "prices.json")))
HOURS_MONTH = 730
PER_USE_PREFIXES = ("CloudFront", "WAF", "Data transfer")
UNKNOWN_RDS_HOUR = 6.0  # a class missing from prices.json: about a 4xlarge, never free
UNKNOWN_REDIS_NODE_HOUR = 1.0
FLOOR_SHARE = 0.4  # a reading below this share of the profile's average burn is treated as incomplete


def burn_per_hour(inv, p=PRICES):
    """Dollars per hour for an inventory of what is running.
    inv = {fargate:[{vcpu,gb,count}], rds:[class], redis:[{type,nodes}],
           ec2:[{type,spot}], alb:n, nat:n, endpoints:n, ipv4:n}"""
    usd = 0.0
    for t in inv.get("fargate", []):  # on-demand price: Spot is cheaper, never undercount
        usd += t["count"] * (t["vcpu"] * p["fargate_vcpu_hour"] + t["gb"] * p["fargate_gb_hour"])
    for cls in inv.get("rds", []):
        usd += p["rds"].get(cls, UNKNOWN_RDS_HOUR)  # unknown class: fixed pessimistic price, not a function of the biggest row
    for r in inv.get("redis", []):
        usd += r["nodes"] * p["redis"].get(r["type"], UNKNOWN_REDIS_NODE_HOUR)
    for e in inv.get("ec2", []):
        price = p["ec2"].get(e["type"], 0.30)
        usd += price * (p["spot_factor"] if e.get("spot") else 1)
    usd += inv.get("alb", 0) * p["alb_hour"] + inv.get("nat", 0) * p["nat_hour"]
    usd += inv.get("endpoints", 0) * p["endpoint_hour"] + inv.get("ipv4", 0) * p["ipv4_hour"]
    usd += (3 * p["kms_key_month"] + 25 * p["secret_month"]) / HOURS_MONTH
    usd += inv.get("other", 0) * 2.0  # OpenSearch / Aurora: not priced item by item, assume $2/h each (pessimistic)
    return usd * 1.10  # +10 %: ALB LCU, NAT/endpoint data, storage, logs and the public IPs are not counted item by item


def aws(*args):
    out = subprocess.run(["aws", *args, "--output", "json"], capture_output=True, text=True, timeout=60)
    if out.returncode != 0:
        raise RuntimeError(out.stderr.strip()[:300])
    return json.loads(out.stdout or "{}")


def inventory(run_id):
    """What really runs for this RunId (tagging API + describe calls)."""
    tagged = aws("resourcegroupstaggingapi", "get-resources", "--tag-filters",
                 "Key=Project,Values=lawbid-loadtest", f"Key=RunId,Values={run_id}")
    arns = [m["ResourceARN"] for m in tagged.get("ResourceTagMappingList", [])]
    inv = {"fargate": [], "rds": [], "redis": [], "ec2": [], "alb": 0, "nat": 0, "endpoints": 0, "ipv4": 0}
    for a in arns:
        if ":loadbalancer/" in a:
            inv["alb"] += 1
        elif ":natgateway/" in a:
            inv["nat"] += 1
        elif ":vpc-endpoint/" in a:
            inv["endpoints"] += 1
        elif ":elastic-ip/" in a:
            inv["ipv4"] += 1
        elif a.startswith(("arn:aws:aoss", "arn:aws:es:", "arn:aws:opensearch")) or (a.startswith("arn:aws:rds") and ":cluster:" in a):
            inv["other"] = inv.get("other", 0) + 1  # priced flat and pessimistic, see burn_per_hour
    for a in arns:
        if ":db:" in a and a.startswith("arn:aws:rds"):
            d = aws("rds", "describe-db-instances", "--db-instance-identifier", a.split(":db:")[1])
            for i in d.get("DBInstances", []):
                inv["rds"].append(i["DBInstanceClass"])
                if i.get("MultiAZ"):
                    inv["rds"].append(i["DBInstanceClass"])  # the standby is billed too
        elif a.startswith("arn:aws:elasticache") and ":replicationgroup:" in a:
            d = aws("elasticache", "describe-replication-groups", "--replication-group-id", a.split(":replicationgroup:")[1])
            for g in d.get("ReplicationGroups", []):
                inv["redis"].append({"type": g.get("CacheNodeType", ""), "nodes": len(g.get("MemberClusters", [])) or 1})
        elif a.startswith("arn:aws:ec2") and ":instance/" in a:
            d = aws("ec2", "describe-instances", "--instance-ids", a.split(":instance/")[1])
            for r in d.get("Reservations", []):
                for i in r.get("Instances", []):
                    if i["State"]["Name"] in ("pending", "running"):
                        inv["ec2"].append({"type": i["InstanceType"], "spot": i.get("InstanceLifecycle") == "spot"})
        elif a.startswith("arn:aws:ecs") and ":service/" in a:
            cluster, svc = a.split(":service/")[1].split("/")
            d = aws("ecs", "describe-services", "--cluster", cluster, "--services", svc)
            for s in d.get("services", []):
                n = s.get("runningCount", 0) + s.get("pendingCount", 0)
                if n:
                    td = aws("ecs", "describe-task-definition", "--task-definition", s["taskDefinition"])["taskDefinition"]
                    inv["fargate"].append({"count": n, "vcpu": int(td["cpu"]) / 1024, "gb": int(td["memory"]) / 1024})
    return inv


def estimate(profile):
    out = subprocess.run(["node", os.path.join(HERE, "estimate-cost.mjs"), profile, "--json"], capture_output=True, text=True)
    e = json.loads(out.stdout)
    per_use = sum(r["usd"] for r in e["rows"] if r["what"].startswith(PER_USE_PREFIXES))
    return e["estimate_usd"], e["hours"], per_use


def cancel_run():
    """Cancel this run; retry until it works (a guard that gives up on a failed cancel protects nothing)."""
    run = os.environ.get("GITHUB_RUN_ID")
    if not run:
        return
    cmd = ["gh", "run", "cancel", run]
    if os.environ.get("GITHUB_REPOSITORY"):
        cmd += ["--repo", os.environ["GITHUB_REPOSITORY"]]  # do not rely on git remote inference
    attempt = 0
    while True:
        attempt += 1
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode == 0:
            print("cost-guard: run cancelled", flush=True)
            return
        print(f"::error::cost-guard: cancel failed ({attempt}): {r.stderr.strip()[:200]}", flush=True)
        time.sleep(15)


def main():
    limit = float(sys.argv[1])
    profile = sys.argv[2]
    run_id = os.environ.get("RUN_ID", "")
    poll = float(os.environ.get("POLL", "60"))
    est_total, est_hours, per_use = estimate(profile)
    floor_burn = (est_total - per_use) / est_hours
    fallback_burn = floor_burn * 1.5
    started = time.time()
    last = started
    spent = 0.0
    fails = 0
    last_burn = 0.0
    warned = False
    if "--once" in sys.argv:
        print(json.dumps({"burn_per_hour": burn_per_hour(inventory(run_id))}))
        return 0
    while True:
        time.sleep(poll)
        now = time.time()
        try:
            burn = max(burn_per_hour(inventory(run_id)), FLOOR_SHARE * floor_burn)
            last_burn = burn
            fails = 0
        except Exception as ex:  # noqa: BLE001 - never go quiet
            fails += 1
            burn = max(last_burn, fallback_burn)  # blind: never count it as free
            print(f"cost-guard: cannot read AWS ({fails}x): {ex}", flush=True)
        spent += burn * (now - last) / 3600
        last = now
        total = spent + per_use * min(1.0, (now - started) / (est_hours * 3600))
        print(f"cost-guard: burn ${burn:.2f}/h, spent about ${total:.2f} of the ${limit:.0f} limit", flush=True)
        if total >= 0.8 * limit and not warned:
            warned = True
            print(f"::warning::cost-guard: 80 % of the ${limit:.0f} limit reached (${total:.2f})", flush=True)
        if total >= limit:
            msg = f"cost-guard: LIMIT ${limit:.0f} reached (about ${total:.2f}): cancelling the run, the stack is destroyed by the always() steps"
            print(f"::error::{msg}", flush=True)
            cancel_run()
            return 4


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as ex:  # noqa: BLE001 - a guard that crashed must not leave a silent run: fail closed
        print(f"::error::cost-guard crashed ({ex}): cancelling the run (fail closed)", flush=True)
        cancel_run()
        sys.exit(5)
