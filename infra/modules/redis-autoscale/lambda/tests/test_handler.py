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
    {"name": "cache.t4g.micro", "vcpu": 2, "memory_gib": 0.5, "max_connections": 65000, "monthly_usd": 23.36, "baseline_pct": 10, "speed": 1.0},
    {"name": "cache.t4g.small", "vcpu": 2, "memory_gib": 1.37, "max_connections": 65000, "monthly_usd": 46.72, "baseline_pct": 20, "speed": 1.0},
    {"name": "cache.t4g.medium", "vcpu": 2, "memory_gib": 3.09, "max_connections": 65000, "monthly_usd": 94.9, "baseline_pct": 20, "speed": 1.0},
]


class Fake:
    def __init__(self, cpu=90.0, status="available", deploying=False, mode="on", failover="enabled",
                 allowed=("cache.t4g.small", "cache.t4g.medium"), fail=False):
        self.cpu, self.status, self.deploying, self.mode = cpu, status, deploying, mode
        self.failover, self.allowed, self.fail = failover, allowed, fail
        self.calls, self.param, self.queries = [], {}, []

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

    def describe_replication_groups(self, ReplicationGroupId):
        return {"ReplicationGroups": [{
            "Status": self.status, "CacheNodeType": "cache.t4g.micro", "AutomaticFailover": self.failover,
            "PendingModifiedValues": {}, "ClusterEnabled": False,
            "MemberClusters": ["g-001", "g-002"], "NodeGroups": [{"Status": self.status}],
        }]}

    def list_allowed_node_type_modifications(self, ReplicationGroupId):
        return {"ScaleUpModifications": list(self.allowed), "ScaleDownModifications": []}

    def modify_replication_group(self, **kw):
        if self.fail:
            raise RuntimeError("InvalidReplicationGroupState")
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
        self.queries = kw["MetricDataQueries"]
        ts = [datetime.fromtimestamp(NOW - 300 * i, timezone.utc) for i in range(4)]
        vals = {"cpu": self.cpu, "mem": 30.0, "conns": 10.0, "credit": 100.0}
        out = []
        for q in kw["MetricDataQueries"]:
            kind = q["Id"].split("_")[0]
            v = vals["mem" if kind == "mem" else kind]
            # the replica (node 1) reports a lower CPU: the merge keeps the worse node
            if kind == "cpu" and q["Id"].endswith("_1"):
                v -= 50
            out.append({"Id": q["Id"], "Timestamps": ts, "Values": [v] * 4})
        return {"MetricDataResults": out}


class HandlerTests(unittest.TestCase):
    def setUp(self):
        os.environ.update(
            LADDER=json.dumps(LADDER), MIN_CLASS="cache.t4g.micro", MAX_CLASS="cache.t4g.medium",
            GROUP_ID="g", TOPIC_ARN="arn:topic", STATE_PARAM="/x/state", MODE_PARAM="/x/mode",
            CLUSTER="c", SERVICES="api,worker",
        )

    def run_with(self, fake, event=None):
        h._clients.clear()
        for n in ("elasticache", "cloudwatch", "ecs", "sns", "ssm"):
            h._clients[n] = fake
        return h.handler(event or {"mode": "tick"}, None, now=NOW)

    def test_load_resizes_one_step_saves_state_and_notifies(self):
        f = Fake()
        self.assertEqual(self.run_with(f)["to"], "cache.t4g.small")
        self.assertEqual([c[0] for c in f.calls], ["modify", "publish"])
        self.assertEqual(f.calls[0][1]["CacheNodeType"], "cache.t4g.small")
        self.assertTrue(f.calls[0][1]["ApplyImmediately"])
        self.assertIn("Redis увеличен", f.calls[1][1]["Message"])
        self.assertEqual(json.loads(f.param["/x/state"])["cls"], "cache.t4g.small")

    def test_both_nodes_are_queried(self):
        f = Fake()
        self.run_with(f)
        nodes = {q["MetricStat"]["Metric"]["Dimensions"][0]["Value"] for q in f.queries}
        self.assertEqual(nodes, {"g-001", "g-002"})

    def test_modifying_blocks(self):
        f = Fake(status="modifying")
        self.assertEqual(self.run_with(f)["result"], "not_available")
        self.assertEqual(f.calls, [])

    def test_failover_not_enabled_blocks(self):
        f = Fake(failover="disabled")
        self.assertEqual(self.run_with(f)["result"], "no_failover")
        self.assertEqual([c[0] for c in f.calls], ["publish"])  # weekly pause notice

    def test_deploy_blocks(self):
        f = Fake(deploying=True)
        self.assertEqual(self.run_with(f)["result"], "deploying")
        self.assertEqual(f.calls, [])

    def test_switched_off_and_unknown_switch(self):
        for mode in ("off", "maybe"):
            f = Fake(mode=mode)
            self.assertEqual(self.run_with(f)["result"], "off")
            self.assertEqual(f.calls, [])

    def test_dry_run_only_writes_to_the_owner(self):
        f = Fake(mode="dry-run")
        self.assertEqual(self.run_with(f)["result"], "dry-run")
        self.assertEqual([c[0] for c in f.calls], ["publish"])
        self.assertIn("ПРОБНЫЙ РЕЖИМ", f.calls[0][1]["Message"])

    def test_calm_does_nothing(self):
        f = Fake(cpu=10.0)
        self.assertEqual(self.run_with(f)["result"], "calm")
        self.assertEqual(f.calls, [])

    def test_target_not_allowed_by_aws(self):
        f = Fake(allowed=("cache.t4g.medium",))
        self.assertEqual(self.run_with(f)["result"], "target_not_allowed")
        self.assertEqual(f.calls, [])

    def test_failed_modify_mails_once_per_6h(self):
        f = Fake(fail=True)
        for _ in range(2):
            with self.assertRaises(RuntimeError):
                self.run_with(f)
            f.param = dict(f.param)
        self.assertEqual([c[0] for c in f.calls], ["publish"])

    def test_force(self):
        f = Fake()
        r = self.run_with(f, {"action": "force", "class": "cache.t4g.medium"})
        self.assertEqual(r["result"], "forced")
        self.assertEqual(f.calls[0][1]["CacheNodeType"], "cache.t4g.medium")

    def test_force_refused_while_modifying(self):
        f = Fake(status="modifying")
        self.assertEqual(self.run_with(f, {"action": "force", "class": "cache.t4g.medium"})["result"], "refused")


if __name__ == "__main__":
    unittest.main()
