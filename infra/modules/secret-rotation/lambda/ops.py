"""Hourly follow-up of secret rotation (no downtime, nothing waits in a loop).

Secrets Manager rotates the secrets (AWS template for the database login,
rotator.py for the rest). Running ECS tasks read secrets only when they
start, so this function finishes the job:

  database  - DB_APP_CREDENTIALS (JSON, alternating users) -> rewrites the
              DATABASE_URL secret (same host / port / query, new user and
              password) and rolls api / worker / pgbouncer. The previous
              user stays valid for a whole rotation period, so tasks that
              have not rolled yet keep working.
  redis     - after a rotation both tokens are valid; roll the services,
              wait STRICT_HOURS, then drop the old token (ElastiCache SET).
  app keys  - the new kid is in the list but not active; roll the services
              so every task knows it; after GRACE_HOURS make it the active
              kid (separate *_ACTIVE_KID secret) and roll again. Old kids
              stay until their overlap ended (JWT) or until an operator
              removes them after re-encryption (messages, admin key store).
  status    - CloudWatch metrics (Problems = overdue or failed rotations)
              that an alarm turns into an e-mail.

Events: {} / {"mode":"tick"} (schedule), {"mode":"bootstrap-db"},
{"mode":"prune","secret":"MESSAGE_ENC_KEYS","kid":"m1"}.
Secret values are never logged or returned.
"""
import json
import logging
import os
import time
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError

import keylogic as kl

log = logging.getLogger()
log.setLevel(logging.INFO)

sm = boto3.client("secretsmanager")
ssm = boto3.client("ssm")
ecs = boto3.client("ecs")
ec = boto3.client("elasticache")
cw = boto3.client("cloudwatch")
sns = boto3.client("sns")

CFG = json.loads(os.environ["CONFIG"])
STATE_PARAM = os.environ["STATE_PARAM"]
NS = os.environ["METRIC_NAMESPACE"]
TOPIC = os.environ.get("TOPIC_ARN", "")


def now():
    return time.time()


def lambda_handler(event, context):
    mode = (event or {}).get("mode", "tick")
    state = load_state()
    if mode == "bootstrap-db":
        out = bootstrap_db(state)
    elif mode == "prune":
        out = prune_manual(state, event["secret"], event["kid"])
    else:
        out = tick(state)
    save_state(state)
    return out


# --- state --------------------------------------------------------------------

def load_state():
    try:
        return json.loads(ssm.get_parameter(Name=STATE_PARAM)["Parameter"]["Value"])
    except (ClientError, ValueError):
        return {}


def save_state(state):
    ssm.put_parameter(Name=STATE_PARAM, Value=json.dumps(state, separators=(",", ":")), Type="String", Overwrite=True)


def notify(subject, body):
    log.info("%s: %s", subject, body)
    if TOPIC:
        try:
            sns.publish(TopicArn=TOPIC, Subject=subject[:99], Message=body)
        except ClientError as e:
            log.warning("sns publish failed: %s", e.response["Error"]["Code"])


# --- helpers ------------------------------------------------------------------

def secret_text(arn):
    return sm.get_secret_value(SecretId=arn)["SecretString"]


def current_version(arn):
    meta = sm.describe_secret(SecretId=arn)
    for v, stages in meta["VersionIdsToStages"].items():
        if "AWSCURRENT" in stages:
            return v
    return None


def roll_services():
    for svc in CFG["services"]:
        try:
            ecs.update_service(cluster=CFG["cluster"], service=svc, forceNewDeployment=True)
            log.info("rolling %s", svc)
        except ClientError as e:
            log.warning("cannot roll %s: %s", svc, e.response["Error"]["Code"])
            raise


# --- database -----------------------------------------------------------------

def bootstrap_db(state):
    """Fill DB_APP_CREDENTIALS (JSON) from the existing DATABASE_URL once."""
    db = CFG["db"]
    try:
        existing = sm.get_secret_value(SecretId=db["json_arn"])["SecretString"]
        if existing:
            return {"bootstrap": "skipped: DB_APP_CREDENTIALS already has a value"}
    except ClientError as e:
        if e.response["Error"]["Code"] != "ResourceNotFoundException":
            raise
    js = kl.db_json_from_url(secret_text(db["url_arn"]), db["master_arn"])
    sm.put_secret_value(SecretId=db["json_arn"], SecretString=json.dumps(js))
    state["db"] = {"version": current_version(db["json_arn"]), "at": now()}
    return {"bootstrap": "ok", "username": js["username"], "host": js["host"]}


def reconcile_db(state):
    db = CFG.get("db")
    if not db:
        return
    try:
        ver = current_version(db["json_arn"])
    except ClientError:
        return  # no value yet: nothing to follow
    seen = state.get("db", {}).get("version")
    if ver is None or ver == seen:
        return
    if seen is None:
        state["db"] = {"version": ver, "at": now()}  # first look: just remember
        return
    js = json.loads(sm.get_secret_value(SecretId=db["json_arn"])["SecretString"])
    new_url = kl.db_url_with_credentials(secret_text(db["url_arn"]), js["username"], js["password"])
    sm.put_secret_value(SecretId=db["url_arn"], SecretString=new_url)
    state["db"] = {"version": ver, "at": now()}
    roll_services()
    notify("Ротация пароля базы", "Пароль базы данных сменён, сервисы перезапускаются без простоя.")


# --- redis --------------------------------------------------------------------

def reconcile_redis(state):
    for short, r in CFG.get("redis", {}).items():
        st = state.setdefault("redis", {}).setdefault(short, {})
        ver = current_version(r["arn"])
        if st.get("version") is None:
            st["version"] = ver  # first look: just remember
            continue
        if ver != st["version"]:
            st["version"] = ver
            st["strict_at"] = now() + CFG["strict_hours"] * 3600
            roll_services()
            notify("Ротация токена Redis", f"{short}: новый токен принят, старый отключится через {CFG['strict_hours']} ч.")
        elif st.get("strict_at") and now() >= st["strict_at"]:
            token = kl.redis_url_token(secret_text(r["arn"]))
            ec.modify_replication_group(
                ReplicationGroupId=r["group"],
                ApplyImmediately=True,
                AuthToken=token,
                AuthTokenUpdateStrategy="SET",  # only the new token stays valid
            )
            st.pop("strict_at")
            st["strict_done_at"] = now()
            notify("Ротация токена Redis", f"{short}: старый токен отключён.")


# --- app keys -----------------------------------------------------------------

def active_kid(k):
    return sm.get_secret_value(SecretId=k["active_arn"])["SecretString"].strip()


def reconcile_keys(state):
    for short, k in CFG.get("keys", {}).items():
        st = state.setdefault("keys", {}).setdefault(short, {"retired_at": {}})
        value = secret_text(k["arn"])
        newest, active = kl.newest_kid(value), active_kid(k)
        if newest != active:
            if "seen_at" not in st or st.get("seen_kid") != newest:
                st["seen_at"], st["seen_kid"] = now(), newest
                roll_services()  # every task now knows the new kid
                notify("Ротация ключей", f"{short}: добавлен ключ {newest}, активным станет через {CFG['grace_hours']} ч.")
            elif kl.should_promote(st["seen_at"], now(), CFG["grace_hours"] * 3600):
                sm.put_secret_value(SecretId=k["active_arn"], SecretString=newest)
                st["retired_at"][active] = now()
                st.pop("seen_at", None)
                roll_services()
                notify("Ротация ключей", f"{short}: активный ключ {newest}, прежний {active} ещё принимается.")
        if short == "JWT_KEYS":
            pruned = kl.prune_expired(
                value, active, {kid: float(t) for kid, t in st["retired_at"].items()}, now(), CFG["jwt_retire_days"] * 86400
            )
            if pruned != value:
                sm.put_secret_value(SecretId=k["arn"], SecretString=pruned)
                notify("Ротация ключей", f"{short}: просроченные старые ключи убраны.")


def prune_manual(state, short, kid):
    """Remove one retired kid after the data it protected was re-encrypted."""
    k = CFG["keys"][short]
    value = secret_text(k["arn"])
    sm.put_secret_value(SecretId=k["arn"], SecretString=kl.remove_kid(value, kid, active_kid(k)))
    return {"pruned": f"{short}:{kid}"}


# --- status / alerts ------------------------------------------------------------

def check_status():
    """Overdue or failed rotations -> metric Problems (alarm -> e-mail)."""
    problems, rows, data = 0, [], []
    for item in CFG["tracked"]:
        try:
            m = sm.describe_secret(SecretId=item["arn"])
        except ClientError as e:
            problems += 1
            rows.append({"name": item["name"], "error": e.response["Error"]["Code"]})
            continue
        ts = lambda d: d.timestamp() if d else None  # noqa: E731
        s = kl.rotation_status(ts(m.get("LastRotatedDate")), ts(m.get("CreatedDate")), item["every_days"], now())
        stuck = False
        for v, stages in m.get("VersionIdsToStages", {}).items():
            if "AWSPENDING" in stages:
                # AWSPENDING without a finish for > 2 h: a step failed.
                stuck = stuck or True
        if m.get("RotationEnabled") is not True:
            s["overdue"] = False  # off on purpose; the admin shows "off"
        failed = stuck and now() - (ts(m.get("LastChangedDate")) or now()) > 7200
        if s["overdue"] or failed:
            problems += 1
        rows.append({"name": item["name"], "overdue": bool(s["overdue"]), "failed": failed})
        # Per-secret facts for the admin «Здоровье системы» (read as CloudWatch
        # statistics by the API; no secret value is involved).
        dim = [{"Name": "Secret", "Value": item["name"]}]
        data.extend(
            [
                {"MetricName": "LastRotatedEpoch", "Dimensions": dim, "Value": s["lastRotated"] or 0},
                {"MetricName": "CreatedEpoch", "Dimensions": dim, "Value": ts(m.get("CreatedDate")) or 0},
                {"MetricName": "RotationEnabled", "Dimensions": dim, "Value": 1 if m.get("RotationEnabled") else 0},
                {"MetricName": "Overdue", "Dimensions": dim, "Value": 1 if s["overdue"] else 0},
                {"MetricName": "Failed", "Dimensions": dim, "Value": 1 if failed else 0},
            ]
        )
    data.append({"MetricName": "Problems", "Value": problems, "Unit": "Count"})
    for i in range(0, len(data), 20):
        cw.put_metric_data(Namespace=NS, MetricData=data[i : i + 20])
    if problems:
        log.warning("rotation problems: %s", json.dumps(rows))  # the alarm sends the e-mail
    return {"problems": problems, "rows": rows}


def tick(state):
    result = {}
    for name, fn in (("db", reconcile_db), ("redis", reconcile_redis), ("keys", reconcile_keys)):
        try:
            fn(state)
        except Exception as e:  # one broken part must not stop the others
            log.exception("%s reconcile failed", name)
            result[name] = f"error: {type(e).__name__}"
            errs = state.setdefault("errors", {})
            if errs.get(name) != result[name]:  # one e-mail per new error, not hourly
                errs[name] = result[name]
                notify("Ротация секретов: ошибка", f"{name}: {type(e).__name__}")
        else:
            state.get("errors", {}).pop(name, None)
    result["status"] = check_status()
    return result
