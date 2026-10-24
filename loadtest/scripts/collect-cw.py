#!/usr/bin/env python3
"""Collects the server-side numbers of a run from CloudWatch (and Performance
Insights) with the aws CLI: ALB, ECS, RDS, ElastiCache, TURN / LiveKit EC2,
CloudFront. Writes <out>/cw.json: for every metric the minimum / average /
maximum of the 1-minute points of the load window (+ the time of the peak).

usage: collect-cw.py <terraform-output.json> <start-iso> <end-iso> <out-dir>
(terraform-output.json = `terraform output -json stack`)
"""
import json
import subprocess
import sys

tfout, start, end, outdir = sys.argv[1:5]
st = json.load(open(tfout))
name = st["name"]["value"] if "value" in st.get("name", {}) else st["name"]


def v(key):
    x = st.get(key)
    return x.get("value") if isinstance(x, dict) and "value" in x else x


def aws(*args):
    r = subprocess.run(["aws", *args, "--output", "json"], capture_output=True, text=True)
    if r.returncode != 0:
        return None
    try:
        return json.loads(r.stdout)
    except Exception:
        return None


def series(ns, metric, dims, stat="Average", period=60, extended=None):
    d = [f"Name={k},Value={val}" for k, val in dims.items()]
    args = ["cloudwatch", "get-metric-statistics", "--namespace", ns, "--metric-name", metric,
            "--start-time", start, "--end-time", end, "--period", str(period)]
    if d:
        args += ["--dimensions", *d]
    args += ["--extended-statistics", extended] if extended else ["--statistics", stat]
    res = aws(*args)
    if not res or not res.get("Datapoints"):
        return None
    key = extended or stat
    pts = sorted(res["Datapoints"], key=lambda p: p["Timestamp"])
    vals = [(p["Timestamp"], (p.get("ExtendedStatistics") or {}).get(key, p.get(key))) for p in pts]
    vals = [(t, x) for t, x in vals if x is not None]
    if not vals:
        return None
    nums = [x for _, x in vals]
    peak = max(vals, key=lambda tv: tv[1])
    return {"min": round(min(nums), 3), "avg": round(sum(nums) / len(nums), 3), "max": round(max(nums), 3),
            "peak_at": peak[0], "points": len(nums), "stat": key}


out = {}
albsuffix = v("alb_arn_suffix")
tg = v("api_target_group_arn_suffix")
if albsuffix:
    d = {"LoadBalancer": albsuffix}
    dt = {"LoadBalancer": albsuffix, "TargetGroup": tg}
    out["alb"] = {
        "requests_per_minute (Sum)": series("AWS/ApplicationELB", "RequestCount", d, "Sum"),
        "target_response_time_s p95": series("AWS/ApplicationELB", "TargetResponseTime", d, extended="p95"),
        "target_response_time_s p99": series("AWS/ApplicationELB", "TargetResponseTime", d, extended="p99"),
        "target_5xx_per_minute (Sum)": series("AWS/ApplicationELB", "HTTPCode_Target_5XX_Count", d, "Sum"),
        "elb_5xx_per_minute (Sum)": series("AWS/ApplicationELB", "HTTPCode_ELB_5XX_Count", d, "Sum"),
        "target_4xx_per_minute (Sum)": series("AWS/ApplicationELB", "HTTPCode_Target_4XX_Count", d, "Sum"),
        "active_connections": series("AWS/ApplicationELB", "ActiveConnectionCount", d, "Sum"),
        "healthy_api_tasks (= task count)": series("AWS/ApplicationELB", "HealthyHostCount", dt, "Maximum"),
        "unhealthy_api_tasks": series("AWS/ApplicationELB", "UnHealthyHostCount", dt, "Maximum"),
    }
cluster = name
out["ecs"] = {}
for svc_key, label in (("api_service_name", "api"), ("worker_service_name", "worker")):
    svc = v(svc_key)
    if svc:
        dm = {"ClusterName": cluster, "ServiceName": svc}
        out["ecs"][label] = {
            "cpu_percent": series("AWS/ECS", "CPUUtilization", dm, "Average"),
            "cpu_percent_max": series("AWS/ECS", "CPUUtilization", dm, "Maximum"),
            "memory_percent": series("AWS/ECS", "MemoryUtilization", dm, "Average"),
            "memory_percent_max": series("AWS/ECS", "MemoryUtilization", dm, "Maximum"),
        }
dbid = v("database_instance_id")
if dbid:
    dm = {"DBInstanceIdentifier": dbid}
    out["rds"] = {m: series("AWS/RDS", m, dm, s) for m, s in (
        ("CPUUtilization", "Average"), ("CPUUtilization", "Maximum"), ("DatabaseConnections", "Maximum"),
        ("FreeableMemory", "Minimum"), ("ReadIOPS", "Maximum"), ("WriteIOPS", "Maximum"),
        ("ReadLatency", "Maximum"), ("WriteLatency", "Maximum"), ("DiskQueueDepth", "Maximum"))}
rg = v("redis_replication_group_id")
if rg:
    dm = {"ReplicationGroupId": rg}
    out["redis"] = {m: series("AWS/ElastiCache", m, dm, s) for m, s in (
        ("EngineCPUUtilization", "Maximum"), ("CPUUtilization", "Maximum"), ("CurrConnections", "Maximum"),
        ("DatabaseMemoryUsagePercentage", "Maximum"), ("NetworkBytesOut", "Sum"))}
out["ec2"] = {}
for label, ids in (("turn", v("turn_instance_ids") or []), ("livekit", [v("livekit_instance_id")] if v("livekit_instance_id") else [])):
    for i, iid in enumerate(ids):
        dm = {"InstanceId": iid}
        out["ec2"][f"{label}-{i}"] = {
            "instance": iid,
            "cpu_percent_max": series("AWS/EC2", "CPUUtilization", dm, "Maximum"),
            "cpu_credit_balance_min": series("AWS/EC2", "CPUCreditBalance", dm, "Minimum"),
            "network_in_bytes_per_min_max": series("AWS/EC2", "NetworkIn", dm, "Maximum"),
            "network_out_bytes_per_min_max": series("AWS/EC2", "NetworkOut", dm, "Maximum"),
            "packets_out_per_min_max": series("AWS/EC2", "NetworkPacketsOut", dm, "Maximum"),
        }

# Performance Insights: the heaviest statements by database load
top = None
if dbid:
    info = aws("rds", "describe-db-instances", "--db-instance-identifier", dbid)
    try:
        rid = info["DBInstances"][0]["DbiResourceId"]
        pi = aws("pi", "describe-dimension-keys", "--service-type", "RDS", "--identifier", rid,
                 "--start-time", start, "--end-time", end, "--metric", "db.load.avg",
                 "--group-by", json.dumps({"Group": "db.sql_tokenized", "Limit": 10}))
        if pi:
            top = [{"load_avg": round(k["Total"], 3), "sql": k["Dimensions"].get("db.sql_tokenized.statement", "")[:300]} for k in pi.get("Keys", [])]
    except Exception:
        top = None
out["top_sql_by_db_load"] = top
json.dump(out, open(f"{outdir}/cw.json", "w"), indent=1, default=str)
print("cw.json written", {k: (len(x) if hasattr(x, '__len__') else x) for k, x in out.items()})
