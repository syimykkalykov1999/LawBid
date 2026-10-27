"""Load-test sweeper (S9-12): the same net as loadtest/scripts/sweep.sh, but
running inside AWS (EventBridge Scheduler, hourly) so it does not depend on a
GitHub cron (which GitHub disables after 60 days without repo activity) or on
one secret. Finds everything tagged Project=lawbid-loadtest whose CreatedAt
tag is older than MAX_AGE_HOURS and deletes only what costs money while it
runs. Switch: SSM MODE_PARAM = on | dry-run | off. Everything else stays for
Terraform / the GitHub watchdog (verify-clean.sh).
"""

import json
import os
from datetime import datetime, timedelta, timezone

_clients = {}


def client(name):
    if name not in _clients:
        import boto3

        _clients[name] = boto3.client(name)
    return _clients[name]


def old_enough(created_at, now, max_hours):
    """True when the CreatedAt tag says older than max_hours. A missing or
    unreadable tag is NOT old: a run in progress may be mid-creation."""
    if not created_at:
        return False
    try:
        t = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
    except ValueError:
        return False
    return now - t >= timedelta(hours=max_hours)


def classify(arn):
    """(kind, id) for the ARNs that cost money while they run, else None."""
    p = arn.split(":")
    res = ":".join(p[5:])
    svc = p[2] if len(p) > 2 else ""
    if svc == "ec2" and res.startswith("instance/"):
        return "ec2", res.split("/")[1]
    if svc == "ec2" and res.startswith("natgateway/"):
        return "nat", res.split("/")[1]
    if svc == "ec2" and res.startswith("elastic-ip/"):
        return "eip", res.split("/")[1]
    if svc == "ecs" and res.startswith("service/"):
        _, cluster, service = res.split("/", 2)
        return "ecs", f"{cluster}/{service}"
    if svc == "rds" and res.startswith("db:"):
        return "rds", res[3:]
    if svc == "elasticache" and res.startswith("replicationgroup:"):
        return "cache", res.split(":", 1)[1]
    if svc == "elasticloadbalancing" and res.startswith("loadbalancer/"):
        return "elb", arn
    return None


ORDER = ["ec2", "ecs", "rds", "cache", "elb", "nat", "eip"]


def plan(resources, now, max_hours):
    """resources = [(arn, tags dict)] -> ordered [(kind, id, arn)] to delete."""
    out = []
    for arn, tags in resources:
        if tags.get("Project") != "lawbid-loadtest":
            continue  # never anything else (the IAM policy denies it as well)
        if not old_enough(tags.get("CreatedAt"), now, max_hours):
            continue
        c = classify(arn)
        if c:
            out.append((c[0], c[1], arn))
    out.sort(key=lambda x: ORDER.index(x[0]))
    return out


def delete(kind, ident, arn):
    if kind == "ec2":
        client("ec2").terminate_instances(InstanceIds=[ident])
    elif kind == "ecs":
        cluster, service = ident.split("/", 1)
        e = client("ecs")
        e.update_service(cluster=cluster, service=service, desiredCount=0)
        e.delete_service(cluster=cluster, service=service, force=True)
    elif kind == "rds":
        r = client("rds")
        r.modify_db_instance(
            DBInstanceIdentifier=ident, DeletionProtection=False, ApplyImmediately=True
        )
        r.delete_db_instance(
            DBInstanceIdentifier=ident,
            SkipFinalSnapshot=True,
            DeleteAutomatedBackups=True,
        )
    elif kind == "cache":
        client("elasticache").delete_replication_group(ReplicationGroupId=ident)
    elif kind == "elb":
        client("elbv2").delete_load_balancer(LoadBalancerArn=arn)
    elif kind == "nat":
        client("ec2").delete_nat_gateway(NatGatewayId=ident)
    elif kind == "eip":
        client("ec2").release_address(AllocationId=ident)


def tagged(region):
    tg = client("resourcegroupstaggingapi")
    out = []
    for page in tg.get_paginator("get_resources").paginate(
        TagFilters=[{"Key": "Project", "Values": ["lawbid-loadtest"]}]
    ):
        for m in page["ResourceTagMappingList"]:
            out.append((m["ResourceARN"], {t["Key"]: t["Value"] for t in m["Tags"]}))
    return out


def lambda_handler(event, context, env=os.environ):
    now = datetime.now(timezone.utc)
    ssm = client("ssm")
    try:
        mode = ssm.get_parameter(Name=env["MODE_PARAM"])["Parameter"]["Value"]
    except ssm.exceptions.ParameterNotFound:
        mode = "on"
    if mode == "off":
        return {"mode": mode}
    todo = plan(tagged(env.get("AWS_REGION", "us-east-1")), now, float(env.get("MAX_AGE_HOURS", "4")))
    done, failed = [], []
    if mode == "on":
        # a pause between the compute / data stores and the network pieces,
        # like sweep.sh: a NAT gateway or an address still in use is retried
        # on the next hourly run.
        for kind, ident, arn in todo:
            try:
                delete(kind, ident, arn)
                done.append(f"{kind}:{ident}")
            except Exception as e:  # noqa: BLE001 - keep going, report
                failed.append(f"{kind}:{ident}: {str(e)[:120]}")
    print(json.dumps({"mode": mode, "found": [f"{k}:{i}" for k, i, _ in todo], "done": done, "failed": failed}))
    if todo and env.get("TOPIC_ARN"):
        verb = "удалил" if mode == "on" else "[пробный режим] удалил бы"
        client("sns").publish(
            TopicArn=env["TOPIC_ARN"],
            Subject="LawBid: забытый нагрузочный стенд",
            Message=(
                f"Нашёл забытый нагрузочный стенд старше {env.get('MAX_AGE_HOURS', '4')} ч и {verb}: "
                + ", ".join(f"{k}:{i}" for k, i, _ in todo)
                + (f". Не получилось: {'; '.join(failed)}" if failed else ".")
                + " Это страховка: обычный прогон за собой убирает всё сам."
            ),
        )
    return {"mode": mode, "done": done, "failed": failed}
