"""Secrets Manager rotation function for the secrets AWS has no template for:

  * REDIS_URL / REDIS_CACHE_URL  - ElastiCache AUTH token (ROTATE strategy:
    old and new token both work until ops.py later switches to SET)
  * JWT_KEYS / SECRETS_MASTER_KEYS / MESSAGE_ENC_KEYS - app key lists: the
    new key is APPENDED, nothing is removed, the ACTIVE kid is not touched
    (ops.py promotes it after a grace period).

The database login uses the AWS-provided alternating-users template instead
(Serverless Application Repository), not this file.

Standard 4-step contract: createSecret, setSecret, testSecret, finishSecret
(https://docs.aws.amazon.com/secretsmanager/latest/userguide/rotate-secrets_lambda-functions.html).
Secret values are never logged.
"""
import base64
import json
import logging
import os
import time

import boto3
from botocore.exceptions import ClientError

import keylogic as kl

log = logging.getLogger()
log.setLevel(logging.INFO)

sm = boto3.client("secretsmanager")
ec = boto3.client("elasticache")
kms = boto3.client("kms")

REDIS_GROUPS = json.loads(os.environ.get("REDIS_GROUPS", "{}"))  # {"REDIS_URL": "lawbid-prod-redis"}
KEY_SECRETS = set(json.loads(os.environ.get("KEY_SECRETS", "[]")))
KMS_KEY_ARN = os.environ.get("KMS_KEY_ARN", "")
KMS_APP = os.environ.get("KMS_APP", "")
WAIT_SECONDS = int(os.environ.get("REDIS_WAIT_SECONDS", "780"))


def lambda_handler(event, context):
    arn, token, step = event["SecretId"], event["ClientRequestToken"], event["Step"]
    meta = sm.describe_secret(SecretId=arn)
    if not meta.get("RotationEnabled"):
        raise ValueError("rotation is not enabled for this secret")
    stages = meta["VersionIdsToStages"]
    if token not in stages:
        raise ValueError("version has no stage for rotation")
    if "AWSCURRENT" in stages[token]:
        log.info("version already current")
        return
    if "AWSPENDING" not in stages[token]:
        raise ValueError("version is not AWSPENDING")

    short = meta["Name"].rsplit("/", 1)[-1]
    if short in REDIS_GROUPS:
        kind = "redis"
    elif short in KEY_SECRETS:
        kind = "keys"
    else:
        raise ValueError("secret is not handled by this function")
    log.info("step=%s kind=%s secret=%s", step, kind, short)

    fn = {
        ("redis", "createSecret"): redis_create,
        ("redis", "setSecret"): redis_set,
        ("redis", "testSecret"): redis_test,
        ("keys", "createSecret"): keys_create,
        ("keys", "setSecret"): lambda *_: None,  # nothing outside the secret changes
        ("keys", "testSecret"): keys_test,
    }.get((kind, step))
    if step == "finishSecret":
        finish(arn, token)
    elif fn is None:
        raise ValueError("invalid step")
    else:
        fn(arn, token, short)


# --- shared ---------------------------------------------------------------

def get_value(arn, stage, token=None):
    kw = {"SecretId": arn}
    if token:
        kw["VersionId"] = token
    else:
        kw["VersionStage"] = stage
    return sm.get_secret_value(**kw)["SecretString"]


def pending_exists(arn, token):
    try:
        sm.get_secret_value(SecretId=arn, VersionId=token, VersionStage="AWSPENDING")
        return True
    except ClientError as e:
        if e.response["Error"]["Code"] == "ResourceNotFoundException":
            return False
        raise


def finish(arn, token):
    meta = sm.describe_secret(SecretId=arn)
    current = None
    for v, stages in meta["VersionIdsToStages"].items():
        if "AWSCURRENT" in stages:
            if v == token:
                return
            current = v
            break
    sm.update_secret_version_stage(
        SecretId=arn, VersionStage="AWSCURRENT", MoveToVersionId=token, RemoveFromVersionId=current
    )
    log.info("finishSecret: new version is AWSCURRENT")


# --- Redis AUTH token -------------------------------------------------------

def redis_create(arn, token, short):
    if pending_exists(arn, token):
        return
    cur = get_value(arn, "AWSCURRENT")
    new = kl.redis_url_with_token(cur, kl.new_redis_token())
    sm.put_secret_value(SecretId=arn, ClientRequestToken=token, SecretString=new, VersionStages=["AWSPENDING"])


def _group_status(group):
    return ec.describe_replication_groups(ReplicationGroupId=group)["ReplicationGroups"][0]["Status"]


def _wait_available(group):
    deadline = time.time() + WAIT_SECONDS
    while time.time() < deadline:
        if _group_status(group) == "available":
            return
        time.sleep(10)
    raise TimeoutError("replication group did not become available")


def redis_set(arn, token, short):
    group = REDIS_GROUPS[short]
    new_token = kl.redis_url_token(get_value(arn, "AWSPENDING", token))
    _wait_available(group)
    try:
        ec.modify_replication_group(
            ReplicationGroupId=group,
            ApplyImmediately=True,
            AuthToken=new_token,
            AuthTokenUpdateStrategy="ROTATE",  # old token keeps working
        )
    except ClientError as e:
        msg = e.response["Error"].get("Message", "")
        # Secrets Manager retried a step that already worked.
        if e.response["Error"]["Code"] in ("InvalidParameterValue", "InvalidParameterCombination") and (
            "already" in msg.lower()
        ):
            log.info("token already set (retry)")
        else:
            raise
    time.sleep(5)
    _wait_available(group)


def redis_test(arn, token, short):
    group = REDIS_GROUPS[short]
    if _group_status(group) != "available":
        raise RuntimeError("replication group is not available")
    # A real AUTH ping needs this Lambda inside the VPC (NAT / endpoints,
    # continuing cost). Instead ElastiCache must accept the request and be
    # available; the connection itself is proven by the first task that
    # starts with the new token (ops.py redeploys, ECS keeps the old task
    # until the new one is healthy).
    kl.redis_url_token(get_value(arn, "AWSPENDING", token))


# --- app key lists ----------------------------------------------------------

def _wrap(secret):
    resp = kms.encrypt(
        KeyId=KMS_KEY_ARN,
        Plaintext=secret.encode(),
        EncryptionContext={"app": KMS_APP} if KMS_APP else {},
    )
    return kl.KMS_PREFIX + base64.b64encode(resp["CiphertextBlob"]).decode()


def keys_create(arn, token, short):
    if pending_exists(arn, token):
        return
    cur = get_value(arn, "AWSCURRENT")
    kid = kl.next_kid(kl.kids(cur))
    secret = kl.new_secret()
    # Same storage form as the existing keys: a KMS-wrapped list stays wrapped.
    stored = _wrap(secret) if (KMS_KEY_ARN and short != "JWT_KEYS" and kl.any_wrapped(cur)) else secret
    new = kl.append_key(cur, kid, stored)
    sm.put_secret_value(SecretId=arn, ClientRequestToken=token, SecretString=new, VersionStages=["AWSPENDING"])


def keys_test(arn, token, short):
    kl.validate_rotated(get_value(arn, "AWSCURRENT"), get_value(arn, "AWSPENDING", token))
