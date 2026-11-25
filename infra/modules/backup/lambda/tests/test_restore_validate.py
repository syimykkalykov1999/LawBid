"""Restore-test validation with fake AWS clients: no AWS, no network."""

import json
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import restore_validate as v  # noqa: E402

ENV = {
    "CLUSTER": "lawbid-staging",
    "TASK_FAMILY": "lawbid-staging-migrate",
    "SUBNETS": json.dumps(["subnet-a", "subnet-b"]),
    "SECURITY_GROUPS": json.dumps(["sg-tasks"]),
    "MIN_USERS": "1",
    "TASK_TIMEOUT_SECONDS": "60",
    "POLL_SECONDS": "15",
}
EVENT = {
    "detail": {
        "restoreJobId": "job-1",
        "resourceType": "RDS",
        "status": "COMPLETED",
        "createdResourceArn": "arn:aws:rds:us-east-1:111111111111:db:awsbackup-restore-test-abc",
        "restoreTestingPlanArn": "arn:aws:backup:us-east-1:111111111111:restore-testing-plan:p",
    }
}


class Rds:
    def __init__(self, endpoint=True):
        self.endpoint = endpoint

    def describe_db_instances(self, DBInstanceIdentifier):
        db = {"DBInstanceStatus": "available"}
        if self.endpoint:
            db["Endpoint"] = {"Address": "awsbackup-restore-test-abc.x.us-east-1.rds.amazonaws.com", "Port": 5432}
        return {"DBInstances": [db]}


class Ecs:
    def __init__(self, exit_codes=(0,), start_fails=False, never_stops=False):
        self.exit_codes = list(exit_codes)
        self.start_fails = start_fails
        self.never_stops = never_stops
        self.run_calls = []
        self.stopped = []

    def run_task(self, **kw):
        self.run_calls.append(kw)
        if self.start_fails:
            return {"tasks": [], "failures": [{"reason": "RESOURCE:ENI"}]}
        return {"tasks": [{"taskArn": "arn:aws:ecs:us-east-1:111111111111:task/lawbid-staging/t1"}], "failures": []}

    def describe_tasks(self, cluster, tasks):
        if self.never_stops:
            return {"tasks": [{"lastStatus": "RUNNING"}]}
        return {"tasks": [{"lastStatus": "STOPPED", "stoppedReason": "Essential container exited", "containers": [{"name": "migrate", "exitCode": self.exit_codes[0]}]}]}

    def stop_task(self, **kw):
        self.stopped.append(kw)


class Backup:
    def __init__(self):
        self.results = []

    def put_restore_validation_result(self, **kw):
        self.results.append(kw)


def run(ecs, rds=None, event=EVENT):
    backup = Backup()
    clients = {"rds": rds or Rds(), "ecs": ecs, "backup": backup}
    with mock.patch.dict(os.environ, ENV, clear=False):
        try:
            out = v.handler(event, None, clients=clients, sleep=lambda s: None)
            err = None
        except RuntimeError as e:
            out, err = None, e
    return out, err, backup.results


class Validation(unittest.TestCase):
    def test_query_check_passes_reports_successful(self):
        ecs = Ecs(exit_codes=(0,))
        out, err, results = run(ecs)
        self.assertIsNone(err)
        self.assertEqual(results[0]["ValidationStatus"], "SUCCESSFUL")
        self.assertEqual(results[0]["RestoreJobId"], "job-1")

    def test_task_points_only_host_and_port_at_the_copy(self):
        ecs = Ecs()
        run(ecs)
        call = ecs.run_calls[0]
        self.assertEqual(call["taskDefinition"], "lawbid-staging-migrate")
        net = call["networkConfiguration"]["awsvpcConfiguration"]
        self.assertEqual(net["assignPublicIp"], "DISABLED")
        self.assertEqual(net["subnets"], ["subnet-a", "subnet-b"])
        o = call["overrides"]["containerOverrides"][0]
        self.assertEqual(o["name"], "migrate")
        self.assertEqual(o["command"][:2], ["node", "-e"])
        envs = {e["name"]: e["value"] for e in o["environment"]}
        self.assertEqual(envs["RESTORE_HOST"], "awsbackup-restore-test-abc.x.us-east-1.rds.amazonaws.com")
        self.assertEqual(envs["RESTORE_PORT"], "5432")
        # The database password never passes through the function.
        self.assertNotIn("DATABASE_URL", envs)

    def test_failed_query_reports_failed_and_raises(self):
        out, err, results = run(Ecs(exit_codes=(4,)))
        self.assertIsNotNone(err)
        self.assertEqual(results[0]["ValidationStatus"], "FAILED")
        self.assertIn("exit 4", results[0]["ValidationStatusMessage"])

    def test_task_that_cannot_start_is_failed(self):
        out, err, results = run(Ecs(start_fails=True))
        self.assertIsNotNone(err)
        self.assertEqual(results[0]["ValidationStatus"], "FAILED")
        self.assertIn("did not start", results[0]["ValidationStatusMessage"])

    def test_timeout_stops_the_task_and_fails(self):
        ecs = Ecs(never_stops=True)
        out, err, results = run(ecs)
        self.assertIsNotNone(err)
        self.assertEqual(len(ecs.stopped), 1)
        self.assertIn("timed out", results[0]["ValidationStatusMessage"])

    def test_no_endpoint_is_failed_not_crash(self):
        out, err, results = run(Ecs(), rds=Rds(endpoint=False))
        self.assertIsNotNone(err)
        self.assertEqual(results[0]["ValidationStatus"], "FAILED")

    def test_other_resource_type_is_skipped(self):
        ev = {"detail": dict(EVENT["detail"], resourceType="EBS")}
        ecs = Ecs()
        out, err, results = run(ecs, event=ev)
        self.assertIsNone(err)
        self.assertEqual(results[0]["ValidationStatus"], "SKIPPED")
        self.assertEqual(ecs.run_calls, [])

    def test_check_script_queries_migrations_users_and_writability(self):
        s = v.CHECK_SCRIPT
        self.assertIn("_prisma_migrations", s)
        self.assertIn("FROM users", s)
        self.assertIn("pg_is_in_recovery()", s)
        self.assertIn("pg-adapter.js", s)


if __name__ == "__main__":
    unittest.main()
