"""The handler with fake AWS clients: the wiring, not the maths."""

import json
import os
import sys
import unittest
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import handler as h  # noqa: E402

NOW = 1_800_000_000.0
LADDER = [
    {"name": "db.t4g.micro", "vcpu": 2, "memory_gib": 1, "max_connections": 99, "monthly_usd": 23.36, "baseline_pct": 10},
    {"name": "db.t4g.small", "vcpu": 2, "memory_gib": 2, "max_connections": 198, "monthly_usd": 47.45, "baseline_pct": 20},
    {"name": "db.t4g.medium", "vcpu": 2, "memory_gib": 4, "max_connections": 396, "monthly_usd": 94.17, "baseline_pct": 20},
]


class Fake:
    def __init__(self, cpu=90.0, status="available", deploying=False, mode="on"):
        self.cpu, self.status, self.deploying, self.mode = cpu, status, deploying, mode
        self.calls, self.param = [], {}

    class exceptions:
        class ParameterNotFound(Exception):
            pass

    def get_parameter(self, Name):
        if Name.endswith("/mode"):
            return {"Parameter": {"Value": self.mode}}
        if Name not in self.param:
            raise self.exceptions.ParameterNotFound()
        return {"Parameter": {"Value": self.param[Name]}}

    def put_parameter(self, Name, Value, **kw):
        self.param[Name] = Value

    def describe_db_instances(self, DBInstanceIdentifier):
        return {"DBInstances": [{"DBInstanceClass": "db.t4g.micro", "DBInstanceStatus": self.status, "MultiAZ": True}]}

    def modify_db_instance(self, **kw):
        self.calls.append(("modify", kw))

    def publish(self, **kw):
        self.calls.append(("publish", kw))

    def describe_services(self, cluster, services):
        dep = [{"rolloutState": "IN_PROGRESS" if self.deploying else "COMPLETED"}]
        return {"services": [{"deployments": dep}], "failures": []}

    def list_tasks(self, **kw):
        return {"taskArns": []}

    def describe_tasks(self, **kw):
        return {"tasks": []}

    def get_metric_data(self, **kw):
        ts = [datetime.fromtimestamp(NOW - 300 * i, timezone.utc) for i in range(4)]
        free = 1024**3 * 0.5
        vals = {"cpu": self.cpu, "mem_free": free, "conns": 10.0, "credit": 100.0}
        return {"MetricDataResults": [{"Id": q["Id"], "Timestamps": ts, "Values": [vals[q["Id"]]] * 4}
                                      for q in kw["MetricDataQueries"]]}


class HandlerTests(unittest.TestCase):
    def setUp(self):
        os.environ.update(
            LADDER=json.dumps(LADDER), MIN_CLASS="db.t4g.micro", MAX_CLASS="db.t4g.medium",
            DB_ID="db", TOPIC_ARN="arn:topic", STATE_PARAM="/x/state", MODE_PARAM="/x/mode",
            CLUSTER="c", SERVICES="api,worker",
        )

    def run_with(self, fake, event=None):
        h._clients.clear()
        for n in ("rds", "cloudwatch", "ecs", "sns", "ssm"):
            h._clients[n] = fake
        return h.handler(event or {"mode": "tick"}, None, now=NOW)

    def test_load_resizes_one_step_saves_state_and_notifies(self):
        f = Fake()
        self.assertEqual(self.run_with(f)["to"], "db.t4g.small")
        kinds = [c[0] for c in f.calls]
        self.assertEqual(kinds, ["modify", "publish"])
        self.assertEqual(f.calls[0][1]["DBInstanceClass"], "db.t4g.small")
        self.assertTrue(f.calls[0][1]["ApplyImmediately"])
        self.assertIn("База увеличена", f.calls[1][1]["Message"])
        self.assertEqual(json.loads(f.param["/x/state"])["cls"], "db.t4g.small")

    def test_second_run_right_after_is_blocked(self):
        f = Fake()
        self.run_with(f)
        f.calls.clear()
        f.status = "modifying"
        self.assertEqual(self.run_with(f)["result"], "not_available")
        self.assertEqual(f.calls, [])

    def test_deploy_blocks(self):
        f = Fake(deploying=True)
        self.assertEqual(self.run_with(f)["result"], "deploying")
        self.assertEqual(f.calls, [])

    def test_switched_off(self):
        f = Fake(mode="off")
        self.assertEqual(self.run_with(f)["result"], "off")
        self.assertEqual(f.calls, [])

    def test_unknown_switch_value_means_off(self):
        f = Fake(mode="maybe")
        self.assertEqual(self.run_with(f)["result"], "off")

    def test_dry_run_only_writes_to_the_owner(self):
        f = Fake(mode="dry-run")
        self.assertEqual(self.run_with(f)["result"], "dry-run")
        self.assertEqual([c[0] for c in f.calls], ["publish"])
        self.assertIn("ПРОБНЫЙ РЕЖИМ", f.calls[0][1]["Message"])

    def test_calm_does_nothing(self):
        f = Fake(cpu=10.0)
        self.assertEqual(self.run_with(f)["result"], "calm")
        self.assertEqual(f.calls, [])

    def test_force(self):
        f = Fake()
        r = self.run_with(f, {"action": "force", "class": "db.t4g.medium"})
        self.assertEqual(r["result"], "forced")
        self.assertEqual(f.calls[0][1]["DBInstanceClass"], "db.t4g.medium")

    def test_force_refused_while_modifying(self):
        f = Fake(status="modifying")
        self.assertEqual(self.run_with(f, {"action": "force", "class": "db.t4g.medium"})["result"], "refused")


if __name__ == "__main__":
    unittest.main()
