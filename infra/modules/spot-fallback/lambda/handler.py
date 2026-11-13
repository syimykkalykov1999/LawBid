"""Fargate Spot fallback Lambda (owner 2026-11-12, row 67).

Two triggers (modules/spot-fallback/main.tf):
  * EventBridge rule: "ECS Service Action" SERVICE_TASK_PLACEMENT_FAILURE of
    this cluster. Only a failure on FARGATE_SPOT (capacityProviderArns or
    reason RESOURCE:FARGATE) of a service in SERVICES counts: that service
    goes to regular Fargate at once.
  * EventBridge Scheduler every 5 minutes {"mode": "tick"}: the backstop for
    a missed event (fewer tasks running than wanted next to a "Capacity is
    unavailable" service event) and the way back to Spot after the hold.

Switch: SSM parameter MODE_PARAM = on | dry-run | off (operations). Owner's
admin control `scale.spot_fallback.mode` (off | on | auto) arrives in the S3
object ops/scale-controls.json written by the economy job. State per service
in SSM STATE_PARAM. Manual: {"action": "status"} prints what it sees.
"""

import json
import os
from datetime import datetime, timezone

import decision as d

_clients = {}
CAPACITY_TEXT = "capacity is unavailable"


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
    raw = ssm_get(env["STATE_PARAM"], "{}") or "{}"
    try:
        j = json.loads(raw)
    except ValueError:
        j = {}
    out = {}
    for name, v in (j if isinstance(j, dict) else {}).items():
        if isinstance(v, dict):
            out[name] = d.SvcState(
                fallback_since=v.get("fallback_since"),
                last_failure=v.get("last_failure"),
                restored_at=v.get("restored_at"),
                strikes=int(v.get("strikes") or 0),
            )
    return out


def write_state(env, states):
    client("ssm").put_parameter(
        Name=env["STATE_PARAM"],
        Type="String",
        Overwrite=True,
        Value=json.dumps({k: v.__dict__ for k, v in states.items()}),
    )


def wanted(env):
    """{"api": Want, ...} of the services Terraform put on Spot."""
    raw = json.loads(env.get("SERVICES") or "{}")
    return {
        name: d.Want(base=int(w.get("base", 1)), fargate=int(w.get("fargate", 1)), spot=int(w.get("spot", 4)))
        for name, w in raw.items()
    }


def read_control(env):
    """Owner's admin control off | on | auto (unreadable = auto)."""
    bucket, key = env.get("CONTROLS_BUCKET"), env.get("CONTROLS_KEY")
    if not bucket or not key:
        return "auto"
    try:
        raw = client("s3").get_object(Bucket=bucket, Key=key)["Body"].read()
        mode = json.loads(raw).get("spot_fallback", {}).get("mode")
        return mode if mode in ("on", "off", "auto") else "auto"
    except Exception:  # noqa: BLE001 - never block on the control file
        return "auto"


def _aware(t):
    if isinstance(t, str):
        t = datetime.fromisoformat(t.replace("Z", "+00:00"))
    return t if t is None or t.tzinfo else t.replace(tzinfo=timezone.utc)


def live_of(svc):
    strategy = tuple(
        (s["capacityProvider"], int(s.get("base", 0)), int(s.get("weight", 0)))
        for s in svc.get("capacityProviderStrategy") or ()
    )
    fails = [
        _aware(e["createdAt"])
        for e in svc.get("events") or ()
        if CAPACITY_TEXT in str(e.get("message", "")).lower()
    ]
    return d.Live(
        strategy=strategy,
        running=int(svc.get("runningCount", 0)),
        desired=int(svc.get("desiredCount", 0)),
        spot_failure_at=max(fails) if fails else None,
    )


def describe(env, names):
    if not names:
        return {}
    res = client("ecs").describe_services(cluster=env["CLUSTER"], services=list(names))
    return {s["serviceName"]: live_of(s) for s in res.get("services", []) if s.get("status") == "ACTIVE"}


def apply(env, name, strategy):
    client("ecs").update_service(
        cluster=env["CLUSTER"],
        service=name,
        capacityProviderStrategy=[
            {"capacityProvider": p, "base": b, "weight": w} for p, b, w in strategy
        ],
        # UpdateService: "This parameter doesn't trigger a new service
        # deployment" — the rolling deployment moves the tasks.
        forceNewDeployment=True,
    )


def notify(env, text):
    topic = env.get("TOPIC_ARN")
    if topic:
        client("sns").publish(TopicArn=topic, Subject="LawBid: серверы Spot", Message=text)


def spot_failure(event):
    """Service name when the event is a FARGATE_SPOT placement failure."""
    if (event or {}).get("detail-type") != "ECS Service Action":
        return None
    det = event.get("detail") or {}
    if det.get("eventName") != "SERVICE_TASK_PLACEMENT_FAILURE":
        return None
    arns = det.get("capacityProviderArns") or []
    on_spot = any(str(a).endswith("/" + d.SPOT) for a in arns)
    if not on_spot and not str(det.get("reason", "")).startswith("RESOURCE:FARGATE"):
        return None
    res = event.get("resources") or []
    return str(res[0]).rsplit("/", 1)[-1] if res else None


RU = {
    "fallback": "перевожу на обычные серверы Fargate (Spot сейчас нет)",
    "restore": "возвращаю на Spot (по одному, без перерыва)",
}


def lambda_handler(event, context, env=os.environ):
    now = datetime.now(timezone.utc)
    cfg = d.Config(**json.loads(env.get("TUNING") or "{}"))
    want = wanted(env)
    mode = ssm_get(env["MODE_PARAM"], "on")
    control = read_control(env)
    states = read_state(env)
    failed = spot_failure(event)
    names = [failed] if failed else list(want)
    names = [n for n in names if n in want]
    live = describe(env, names)
    out = {"mode": mode, "control": control, "decisions": {}}
    changed = False
    for name in names:
        if name not in live:
            continue
        st = states.get(name, d.SvcState())
        act = (
            d.on_failure(live[name], st, cfg, now, control)
            if failed
            else d.on_tick(live[name], want[name], st, cfg, now, control)
        )
        out["decisions"][name] = {"action": act.action, "reason": act.reason}
        if (event or {}).get("action") == "status" or mode == "off":
            continue
        if act.action == "none":
            if act.state != st:
                states[name] = act.state
                changed = True
            continue
        strategy = d.fallback_strategy(want[name]) if act.action == "fallback" else d.normal_strategy(want[name])
        if mode == "dry-run":
            notify(env, f"[пробный режим] Сервис {name}: я бы {RU[act.action]}. Причина: {act.reason}.")
            continue
        apply(env, name, strategy)
        states[name] = act.state
        changed = True
        notify(env, f"Сервис {name}: {RU[act.action]}. Причина: {act.reason}. Делать ничего не нужно.")
    if changed:
        write_state(env, states)
    print(json.dumps(out))
    return out

