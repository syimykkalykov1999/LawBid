"""Database autoscaler Lambda: reads the facts, asks decision.decide, acts.

docs/architecture/DB_AUTOSCALE.md. Triggers (EventBridge Scheduler):
  {"mode": "tick"}   every 5 minutes: grow when under load
  {"mode": "night"}  03:30 America/Chicago: shrink when 3 days were quiet
Manual:
  {"action": "force", "class": "db.t4g.medium"}   resize now (guards apply)
  {"action": "status"}                            print what it sees
Kill switch: SSM parameter MODE_PARAM = on | dry-run | off.
"""

import json
import os
import time
from dataclasses import replace
from datetime import datetime, timezone

import decision as d

_clients = {}


def client(name):
    if name not in _clients:
        import boto3  # imported late: the tests do not need it

        _clients[name] = boto3.client(name)
    return _clients[name]


def load_config(env=os.environ):
    ladder = tuple(d.ClassSpec(**x) for x in json.loads(env["LADDER"]))
    base = d.Config(
        ladder=ladder,
        min_class=env["MIN_CLASS"],
        max_class=env["MAX_CLASS"],
        require_multi_az=env.get("REQUIRE_MULTI_AZ", "true") == "true",
    )
    return replace(base, **json.loads(env.get("TUNING") or "{}"))


def apply_ceiling_param(cfg, env=os.environ):
    """Cost registry V4: the app writes the biggest size the money allows into
    the SSM parameter MAX_CLASS_PARAM (economy tick, from the allowed spend).
    It can only LOWER the Terraform ceiling (MAX_CLASS), never raise it; a
    missing, unknown or empty value changes nothing."""
    name = env.get("MAX_CLASS_PARAM")
    if not name:
        return cfg
    try:
        v = client("ssm").get_parameter(Name=name)["Parameter"]["Value"].strip()
    except client("ssm").exceptions.ParameterNotFound:
        return cfg
    i, top = cfg.index(v), cfg.index(cfg.max_class)
    if i < 0 or top < 0 or i >= top:
        return cfg
    return replace(cfg, max_class=v)


# --- state (SSM parameter) --------------------------------------------------


def read_state(name):
    try:
        raw = client("ssm").get_parameter(Name=name)["Parameter"]["Value"]
        j = json.loads(raw) if raw and raw != "{}" else {}
    except client("ssm").exceptions.ParameterNotFound:
        j = {}
    return d.State(
        cls=j.get("cls"),
        last_up=j.get("last_up"),
        last_down=j.get("last_down"),
        last_change=j.get("last_change"),
        notified=j.get("notified", {}),
    )


def write_state(name, s):
    body = {
        "cls": s.cls,
        "last_up": s.last_up,
        "last_down": s.last_down,
        "last_change": s.last_change,
        "notified": s.notified,
    }
    client("ssm").put_parameter(
        Name=name, Value=json.dumps(body), Type="String", Overwrite=True
    )


def read_mode(name):
    v = client("ssm").get_parameter(Name=name)["Parameter"]["Value"].strip()
    return v if v in ("on", "dry-run", "off") else "off"  # unknown = safe


# --- facts ------------------------------------------------------------------


def describe(db_id):
    r = client("rds").describe_db_instances(DBInstanceIdentifier=db_id)
    i = r["DBInstances"][0]
    return d.Instance(
        cls=i["DBInstanceClass"],
        status=i["DBInstanceStatus"],
        multi_az=bool(i.get("MultiAZ")),
        pending=bool(i.get("PendingModifiedValues")),
        has_replicas=bool(i.get("ReadReplicaDBInstanceIdentifiers")),
    )


def ecs_guards(cluster, services):
    """(deploying, oneoff_tasks, unknown). A rollout, or a one-off task
    (migrate, i18n), must never meet a failover."""
    if not cluster:
        return False, False, False
    ecs = client("ecs")
    deploying = False
    if services:
        r = ecs.describe_services(cluster=cluster, services=services)
        if r.get("failures"):
            return False, False, True
        for s in r["services"]:
            deps = s.get("deployments", [])
            if len(deps) > 1 or any(x.get("rolloutState") == "IN_PROGRESS" for x in deps):
                deploying = True
    arns, token = [], None
    while True:
        kw = {"cluster": cluster, "desiredStatus": "RUNNING"}
        if token:
            kw["nextToken"] = token
        r = ecs.list_tasks(**kw)
        arns += r.get("taskArns", [])
        token = r.get("nextToken")
        if not token:
            break
    oneoff = False
    for k in range(0, len(arns), 100):
        for t in ecs.describe_tasks(cluster=cluster, tasks=arns[k : k + 100])["tasks"]:
            if not str(t.get("group", "")).startswith("service:"):
                oneoff = True
    return deploying, oneoff, False


def metric_series(db_id, cfg, hours, with_credit, now):
    end = int(now // cfg.period_s * cfg.period_s)
    start = end - int(hours * 3600)
    dims = [{"Name": "DBInstanceIdentifier", "Value": db_id}]
    spec = {"cpu": ("CPUUtilization", "Average"), "mem_free": ("FreeableMemory", "Minimum"),
            "conns": ("DatabaseConnections", "Maximum")}
    if with_credit:
        spec["credit"] = ("CPUCreditBalance", "Minimum")
    queries = [
        {"Id": k, "MetricStat": {"Metric": {"Namespace": "AWS/RDS", "MetricName": m, "Dimensions": dims},
                                 "Period": cfg.period_s, "Stat": s}}
        for k, (m, s) in spec.items()
    ]
    out = {k: [] for k in spec}
    token = None
    while True:
        kw = {"MetricDataQueries": queries, "ScanBy": "TimestampAscending",
              "StartTime": datetime.fromtimestamp(start, timezone.utc),
              "EndTime": datetime.fromtimestamp(end, timezone.utc)}
        if token:
            kw["NextToken"] = token
        r = client("cloudwatch").get_metric_data(**kw)
        for x in r["MetricDataResults"]:
            pairs = list(zip(x["Timestamps"], x["Values"]))
            out[x["Id"]] += pairs
        token = r.get("NextToken")
        if not token:
            break
    # oldest first, values only
    return d.Metrics(**{k: tuple(v for _, v in sorted(p)) for k, p in out.items()})


def night_ok(tz_name, now, first=1, last=6):
    try:
        from zoneinfo import ZoneInfo

        h = datetime.fromtimestamp(now, ZoneInfo(tz_name)).hour
        return first <= h < last
    except Exception:  # no tz database: the scheduler already picks the hour
        return True


# --- act --------------------------------------------------------------------


def notify(topic, text):
    client("sns").publish(TopicArn=topic, Subject="LawBid: база данных", Message=text)


def due(state, key, now, hours):
    """True when this kind of notice was not sent during the last `hours`."""
    last = state.notified.get(key)
    return last is None or now - last >= hours * 3600


def stamp(state, key, now):
    return replace(state, notified={**state.notified, key: now})


def log(**kw):
    print(json.dumps(kw, ensure_ascii=False, default=str))


def resize(db_id, target):
    client("rds").modify_db_instance(
        DBInstanceIdentifier=db_id, DBInstanceClass=target, ApplyImmediately=True
    )


SKIP_NOTICE_RU = {
    "has_replicas": "у базы есть реплики чтения (их размер нужно менять вместе, это ручная работа)",
    "not_multi_az": "база не в режиме Multi-AZ, смена размера дала бы простой на несколько минут",
}


def handler(event, context=None, now=None):
    env = os.environ
    now = time.time() if now is None else now
    cfg = apply_ceiling_param(load_config())
    db_id, topic = env["DB_ID"], env["TOPIC_ARN"]
    state_name = env["STATE_PARAM"]
    action = event.get("action", "auto")
    mode = event["mode"] if event.get("mode") in ("tick", "night") else "tick"

    switch = read_mode(env["MODE_PARAM"])
    inst = describe(db_id)
    state = read_state(state_name)

    if action == "status":
        log(event="status", switch=switch, instance=inst.cls, status=inst.status, state=state.__dict__)
        return {"switch": switch, "class": inst.cls, "status": inst.status}

    if action == "force":
        target = event["class"]
        if cfg.index(target) < 0 or inst.status != "available" or inst.pending:
            log(event="force_refused", target=target, status=inst.status, pending=inst.pending)
            return {"result": "refused"}
        resize(db_id, target)
        a, b = cfg.index(inst.cls), cfg.index(target)
        s = replace(state, cls=target, last_change=now,
                    last_up=now if b > a else state.last_up,
                    last_down=now if b < a else state.last_down)
        write_state(state_name, s)
        notify(topic, f"База переключена вручную: {inst.cls} → {target}. "
                      "При переключении будет короткая пауза, около минуты.")
        log(event="forced", frm=inst.cls, to=target)
        return {"result": "forced", "to": target}

    if switch == "off":
        log(event="skip", reason="switched_off")
        return {"result": "off"}

    # Reconcile only when nothing is in flight, so our own pending change is
    # not mistaken for somebody else's.
    if inst.status == "available" and not inst.pending:
        s2 = d.reconcile_state(cfg, state, inst.cls, now)
        if s2 != state:
            write_state(state_name, s2)
            state = s2

    cur = cfg.spec(inst.cls)
    deploying, oneoff, unknown = ecs_guards(
        env.get("CLUSTER", ""), [x for x in env.get("SERVICES", "").split(",") if x]
    )
    guards = d.Guards(deploying, oneoff, unknown, night_ok(env.get("NIGHT_TZ", "America/Chicago"), now))
    hours = cfg.down_window_h if mode == "night" else cfg.period_s * 4 / 3600
    m = metric_series(db_id, cfg, hours, cur is not None and cur.baseline_pct is not None, now)
    dec = d.decide(cfg, mode, inst, guards, state, m, now)
    log(event="decision", mode=mode, switch=switch, cls=inst.cls, action=dec.action,
        reason=dec.reason, target=dec.target, facts=dec.facts)

    if dec.reason in SKIP_NOTICE_RU:
        if due(state, dec.reason, now, 168):
            notify(topic, "Автомасштабирование базы стоит на паузе: " + SKIP_NOTICE_RU[dec.reason] + ".")
            write_state(state_name, stamp(state, dec.reason, now))
        return {"result": dec.reason}

    if dec.reason == "at_max":
        if due(state, "cap", now, 6):
            notify(topic, d.cap_message(cfg, dec, inst.cls))
            write_state(state_name, stamp(state, "cap", now))
        return {"result": "at_max"}

    if dec.action == "none":
        return {"result": dec.reason}

    text = d.message(cfg, dec, inst.cls, inst.multi_az, dry_run=(switch == "dry-run"))
    if switch == "dry-run":
        if due(state, "dry-" + dec.action, now, 6):
            notify(topic, text)
            write_state(state_name, stamp(state, "dry-" + dec.action, now))
        return {"result": "dry-run", "would": dec.target}

    try:
        resize(db_id, dec.target)
    except Exception as e:
        notify(topic, f"Не удалось изменить размер базы {inst.cls} → {dec.target}: {e}. "
                      "Ничего не сломано, попробую в следующий раз.")
        raise
    s = replace(state, cls=dec.target, last_change=now,
                last_up=now if dec.action == "up" else state.last_up,
                last_down=now if dec.action == "down" else state.last_down)
    write_state(state_name, s)
    notify(topic, text)
    return {"result": dec.action, "to": dec.target}


lambda_handler = handler
