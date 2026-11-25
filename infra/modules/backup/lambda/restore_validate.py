"""Validation step of the monthly AWS Backup restore test (item 20, D7).

The pattern is AWS's own, "Restore testing validation"
(aws-backup/latest/devguide/restore-testing-validation.html, read 25.11.2026):
an EventBridge rule on "Restore Job State Change" = COMPLETED for our restore
testing plan invokes this function, the function checks the restored copy and
reports the result with PutRestoreValidationResult. AWS Backup deletes the
copy itself when the validation window ends (cleanup is AWS's, not ours).

The check is a real query against the restored database. It runs inside the
VPC as a one-off run of our own migrate task (same image, same database
login, same TLS handling as the app: dist/src/prisma/pg-adapter.js), with
only the host and port pointed at the restored copy. The function itself has
no network access to the database and no password; it only starts the task
and reads its exit code.

Exit code 0 = SUCCESSFUL. Anything else (task failed to start, query failed,
no applied migrations, the copy is read-only, too few users) = FAILED, and the
function then raises so its Errors alarm rings the phone.
"""

import json
import os
import time

# Runs inside the api image (WORKDIR /repo/apps/api). Prints one JSON line
# that the restore drill record copies (docs/runbooks/chaos-and-restore-drills.md).
CHECK_SCRIPT = r"""
const { Pool } = require('pg');
const { pgAdapterConfig } = require('./dist/src/prisma/pg-adapter.js');
const u = new URL(process.env.DATABASE_URL);
u.hostname = process.env.RESTORE_HOST;
u.port = process.env.RESTORE_PORT;
const cfg = pgAdapterConfig(u.toString());
const pool = new Pool({ ...cfg.pool, max: 1 });
const minUsers = Number(process.env.RESTORE_MIN_USERS || '1');
(async () => {
  const one = async (sql) => (await pool.query(sql)).rows[0];
  if (cfg.schema) await pool.query(`SET search_path TO "${cfg.schema.replace(/"/g, '')}"`);
  const rec = await one('SELECT pg_is_in_recovery() AS r, version() AS v');
  const mig = await one('SELECT count(*)::int AS n, max(finished_at) AS last FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL');
  const usr = await one('SELECT count(*)::int AS n, max(created_at) AS newest FROM users');
  const out = { restore_check: { in_recovery: rec.r, version: rec.v, migrations: mig.n, last_migration: mig.last, users: usr.n, newest_user: usr.newest } };
  console.log(JSON.stringify(out));
  await pool.end();
  if (rec.r) { console.error('restore_check_failed: restored copy is read-only'); process.exit(3); }
  if (mig.n < 1) { console.error('restore_check_failed: no applied migrations'); process.exit(4); }
  if (usr.n < minUsers) { console.error('restore_check_failed: users ' + usr.n + ' < ' + minUsers); process.exit(5); }
})().catch((e) => { console.error('restore_check_failed: ' + e.message); process.exit(1); });
"""


def env():
    return {
        "cluster": os.environ["CLUSTER"],
        "task_family": os.environ["TASK_FAMILY"],
        "container": os.environ.get("CONTAINER", "migrate"),
        "subnets": json.loads(os.environ["SUBNETS"]),
        "security_groups": json.loads(os.environ["SECURITY_GROUPS"]),
        "min_users": os.environ.get("MIN_USERS", "1"),
        "timeout_s": int(os.environ.get("TASK_TIMEOUT_SECONDS", "720")),
        "poll_s": int(os.environ.get("POLL_SECONDS", "15")),
    }


def db_endpoint(rds, created_arn):
    db = rds.describe_db_instances(DBInstanceIdentifier=created_arn)["DBInstances"][0]
    ep = db.get("Endpoint") or {}
    if not ep.get("Address"):
        raise RuntimeError("restored instance has no endpoint yet: %s" % db.get("DBInstanceStatus"))
    return ep["Address"], str(ep.get("Port", 5432))


def run_check(ecs, cfg, host, port, job_id):
    resp = ecs.run_task(
        cluster=cfg["cluster"],
        taskDefinition=cfg["task_family"],
        launchType="FARGATE",
        count=1,
        startedBy=("restore-check-" + job_id)[:36],
        networkConfiguration={
            "awsvpcConfiguration": {
                "subnets": cfg["subnets"],
                "securityGroups": cfg["security_groups"],
                "assignPublicIp": "DISABLED",
            }
        },
        overrides={
            "containerOverrides": [
                {
                    "name": cfg["container"],
                    "command": ["node", "-e", CHECK_SCRIPT],
                    "environment": [
                        {"name": "RESTORE_HOST", "value": host},
                        {"name": "RESTORE_PORT", "value": port},
                        {"name": "RESTORE_MIN_USERS", "value": cfg["min_users"]},
                    ],
                }
            ]
        },
    )
    if resp.get("failures") or not resp.get("tasks"):
        return None, "task did not start: %s" % json.dumps(resp.get("failures"))
    return resp["tasks"][0]["taskArn"], ""


def wait_exit(ecs, cfg, task_arn, sleep=time.sleep):
    waited = 0
    while waited <= cfg["timeout_s"]:
        t = ecs.describe_tasks(cluster=cfg["cluster"], tasks=[task_arn])["tasks"][0]
        if t.get("lastStatus") == "STOPPED":
            for c in t.get("containers", []):
                if c.get("name") == cfg["container"]:
                    return c.get("exitCode"), t.get("stoppedReason", "")
            return None, t.get("stoppedReason", "")
        sleep(cfg["poll_s"])
        waited += cfg["poll_s"]
    ecs.stop_task(cluster=cfg["cluster"], task=task_arn, reason="restore check timed out")
    return None, "timed out after %ss" % cfg["timeout_s"]


def handler(event, _context, clients=None, sleep=time.sleep):
    if clients is None:
        import boto3  # in the Lambda runtime; the unit tests pass fakes

        clients = {"rds": boto3.client("rds"), "ecs": boto3.client("ecs"), "backup": boto3.client("backup")}
    c = clients
    detail = event.get("detail", {})
    job_id = detail["restoreJobId"]
    cfg = env()
    status, message = "FAILED", ""
    try:
        if detail.get("resourceType") != "RDS":
            status, message = "SKIPPED", "not an RDS restore: %s" % detail.get("resourceType")
        else:
            host, port = db_endpoint(c["rds"], detail["createdResourceArn"])
            task_arn, err = run_check(c["ecs"], cfg, host, port, job_id)
            if task_arn is None:
                message = err
            else:
                code, reason = wait_exit(c["ecs"], cfg, task_arn, sleep)
                if code == 0:
                    status, message = "SUCCESSFUL", "query check passed (task %s)" % task_arn.rsplit("/", 1)[-1]
                else:
                    message = "query check exit %s %s; logs: migrate log group, task %s" % (code, reason, task_arn.rsplit("/", 1)[-1])
    except Exception as e:  # noqa: BLE001 - every failure must be reported as FAILED
        message = "validation error: %s" % e
    print(json.dumps({"restoreJobId": job_id, "status": status, "message": message}))
    c["backup"].put_restore_validation_result(
        RestoreJobId=job_id, ValidationStatus=status, ValidationStatusMessage=message[:1000]
    )
    if status == "FAILED":
        # The function's Errors alarm is the phone call.
        raise RuntimeError("restore validation FAILED: " + message)
    return {"status": status, "message": message}


lambda_handler = handler
