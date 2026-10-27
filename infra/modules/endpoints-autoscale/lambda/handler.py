"""VPC endpoint autoscaler Lambda (EventBridge Scheduler, hourly).

Creates the interface endpoints when NAT traffic is high and removes them
after a quiet week. Only endpoints tagged ManagedBy=<name>-endpoints-autoscale
are ever touched; endpoints made by Terraform are left alone.
Switch: SSM parameter MODE_PARAM = on | dry-run | off. Admin ceiling: SSM
parameter CEILING_PARAM = most endpoints it may keep (0 = none).
Manual: {"action": "status"} prints what it sees.
"""

import json
import os
from datetime import datetime, timedelta, timezone

import decision as d

_clients = {}


def client(name):
    if name not in _clients:
        import boto3

        _clients[name] = boto3.client(name)
    return _clients[name]


def ssm_get(name, default=""):
    s = client("ssm")
    try:
        return s.get_parameter(Name=name)["Parameter"]["Value"]
    except s.exceptions.ParameterNotFound:
        return default


def read_state(env):
    raw = ssm_get(env["STATE_PARAM"], "{}")
    j = json.loads(raw) if raw and raw != "{}" else {}
    return d.State(last_change=j.get("last_change"), notified=j.get("notified", {}))


def write_state(env, st):
    client("ssm").put_parameter(
        Name=env["STATE_PARAM"],
        Type="String",
        Overwrite=True,
        Value=json.dumps({"last_change": st.last_change, "notified": st.notified}),
    )


def gb_series(queries, now, hours, period):
    """Sum of NAT / endpoint bytes per period, GB, oldest first."""
    if not queries:
        return {}
    cw = client("cloudwatch")
    res = cw.get_metric_data(
        MetricDataQueries=queries,
        StartTime=now - timedelta(hours=hours),
        EndTime=now,
        ScanBy="TimestampAscending",
    )
    out = {}
    for r in res["MetricDataResults"]:
        for t, v in zip(r["Timestamps"], r["Values"]):
            out[(r["Id"], t)] = v
    return out


def nat_queries(nat_ids, period):
    q = []
    for i, nat in enumerate(nat_ids):
        for j, metric in enumerate(("BytesOutToDestination", "BytesInFromSource")):
            q.append(
                {
                    "Id": f"n{i}_{j}",
                    "MetricStat": {
                        "Metric": {
                            "Namespace": "AWS/NATGateway",
                            "MetricName": metric,
                            "Dimensions": [{"Name": "NatGatewayId", "Value": nat}],
                        },
                        "Period": period,
                        "Stat": "Sum",
                    },
                    "ReturnData": True,
                }
            )
    return q


def endpoint_queries(endpoint_ids, period):
    q = []
    for i, ep in enumerate(endpoint_ids):
        q.append(
            {
                "Id": f"e{i}",
                "MetricStat": {
                    "Metric": {
                        "Namespace": "AWS/PrivateLinkEndpoints",
                        "MetricName": "BytesProcessed",
                        "Dimensions": [{"Name": "VPC Endpoint Id", "Value": ep}],
                    },
                    "Period": period,
                    "Stat": "Sum",
                },
                "ReturnData": True,
            }
        )
    return q


def bucket(series, now, n, period):
    """Fold {(id, time): bytes} into n buckets of `period` seconds, GB."""
    buckets = [0.0] * n
    start = now - timedelta(seconds=period * n)
    for (_id, t), v in series.items():
        idx = int((t - start).total_seconds() // period)
        if 0 <= idx < n:
            buckets[idx] += v / 1e9
    return tuple(buckets)


def ours(env):
    ec2 = client("ec2")
    res = ec2.describe_vpc_endpoints(
        Filters=[
            {"Name": "vpc-id", "Values": [env["VPC_ID"]]},
            {"Name": "tag:ManagedBy", "Values": [env["MANAGED_TAG"]]},
        ]
    )
    return {
        e["ServiceName"].split(f"com.amazonaws.{env['AWS_REGION']}.", 1)[-1]: e[
            "VpcEndpointId"
        ]
        for e in res["VpcEndpoints"]
        if e["State"] not in ("deleted", "deleting")
    }


def read_control(env):
    """The owner's admin control (off | on | auto) and ceiling, copied by the
    economy job to one S3 object. Unreadable = auto with the SSM ceiling."""
    bucket, key = env.get("CONTROLS_BUCKET"), env.get("CONTROLS_KEY")
    if not bucket or not key:
        return "auto", None
    try:
        raw = client("s3").get_object(Bucket=bucket, Key=key)["Body"].read()
        j = json.loads(raw).get("endpoints", {})
        mode = j.get("mode") if j.get("mode") in ("on", "off", "auto") else "auto"
        ceil = j.get("ceiling")
        return mode, int(ceil) if isinstance(ceil, (int, float)) else None
    except Exception:  # noqa: BLE001 - never block on the control file
        return "auto", None


def collect(env, now):
    nat_ids = [x for x in env.get("NAT_IDS", "").split(",") if x]
    have = ours(env)
    hours = 8 * 24
    hourly = bucket(
        gb_series(nat_queries(nat_ids, 3600), now, 24, 3600), now, 24, 3600
    )
    day_series = gb_series(nat_queries(nat_ids, 86400), now, hours, 86400)
    day_series.update(
        gb_series(endpoint_queries(list(have.values()), 86400), now, hours, 86400)
    )
    daily = bucket(day_series, now, 8, 86400)[:-1] if nat_ids else ()
    wanted = tuple(x for x in env["SERVICES"].split(",") if x)
    ceiling = int(ssm_get(env["CEILING_PARAM"], str(len(wanted))) or 0)
    control, admin_ceiling = read_control(env)
    if admin_ceiling is not None:
        ceiling = min(ceiling, admin_ceiling)
    return (
        d.Facts(
            mode=ssm_get(env["MODE_PARAM"], "on"),
            wanted=wanted,
            present=tuple(have),
            ceiling=ceiling,
            hourly_nat_gb=hourly,
            daily_total_gb=daily,
            control=control,
        ),
        have,
    )


def notify(env, text):
    client("sns").publish(
        TopicArn=env["TOPIC_ARN"], Subject="LawBid: VPC-эндпоинты", Message=text
    )


def create(env, services):
    ec2 = client("ec2")
    region = env["AWS_REGION"]
    subnets = [x for x in env["SUBNET_IDS"].split(",") if x]
    for s in services:
        ec2.create_vpc_endpoint(
            VpcId=env["VPC_ID"],
            ServiceName=f"com.amazonaws.{region}.{s}",
            VpcEndpointType="Interface",
            SubnetIds=subnets,
            SecurityGroupIds=[env["SG_ID"]],
            PrivateDnsEnabled=True,
            TagSpecifications=[
                {
                    "ResourceType": "vpc-endpoint",
                    "Tags": [
                        {"Key": "ManagedBy", "Value": env["MANAGED_TAG"]},
                        {"Key": "Name", "Value": f"{env['NAME']}-{s}"},
                    ],
                }
            ],
        )


def lambda_handler(event, context, env=os.environ):
    now = datetime.now(timezone.utc)
    cfg = d.Config(**json.loads(env.get("TUNING") or "{}"))
    facts, have = collect(env, now)
    st = read_state(env)
    dec = d.decide(facts, st, cfg, now)
    out = {"mode": facts.mode, "present": list(facts.present), "decision": dec.__dict__}
    print(json.dumps(out, default=list))
    if (event or {}).get("action") == "status" or dec.action == "none":
        return out
    verb = "создаю" if dec.action == "create" else "удаляю"
    if facts.mode == "dry-run":
        notify(env, f"[пробный режим] Я бы {verb} эндпоинты {', '.join(dec.services)}: {dec.reason}.")
        return out
    if dec.action == "create":
        create(env, dec.services)
    else:
        client("ec2").delete_vpc_endpoints(
            VpcEndpointIds=[have[s] for s in dec.services if s in have]
        )
    write_state(env, d.State(last_change=now.isoformat(), notified=st.notified))
    notify(env, f"Я {verb} эндпоинты {', '.join(dec.services)}: {dec.reason}. Это нормально, делать ничего не нужно.")
    return out
