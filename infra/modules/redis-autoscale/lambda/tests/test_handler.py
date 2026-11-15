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

    def run_with(self, fake, event=None, now=NOW):
        h._clients.clear()
        for n in ("elasticache", "cloudwatch", "ecs", "sns", "ssm"):
            h._clients[n] = fake
        return h.handler(event or {"mode": "tick"}, None, now=now)

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
        # by day: NOW is 02:00 in Chicago (night window), +10 h = noon
        self.assertEqual(self.run_with(f, now=NOW + 10 * 3600)["result"], "no_failover")
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

    def test_ceiling_param_can_only_lower_the_ceiling(self):
        os.environ["MAX_CLASS_PARAM"] = "/x/max-class"
        self.addCleanup(os.environ.pop, "MAX_CLASS_PARAM", None)
        f = Fake()
        f.param["/x/max-class"] = "cache.t4g.micro"  # money allows only the smallest node
        self.run_with(f)
        self.assertEqual([c for c in f.calls if c[0] == "modify"], [])

    def test_ceiling_param_never_raises_and_ignores_garbage(self):
        os.environ["MAX_CLASS_PARAM"] = "/x/max-class"
        self.addCleanup(os.environ.pop, "MAX_CLASS_PARAM", None)
        for value in ("cache.r7g.2xlarge", "nonsense", ""):
            f = Fake()
            f.param["/x/max-class"] = value
            self.assertEqual(self.run_with(f)["to"], "cache.t4g.small")


if __name__ == "__main__":
    unittest.main()


class DeployQuietTests(unittest.TestCase):
    """13.11: a rollout ECS calls COMPLETED still holds a resize for
    DEPLOY_QUIET_SEC (the deploy job keeps smoke-testing prod)."""

    def guards_with(self, updated_at):
        class Ecs:
            def describe_services(self, cluster, services):
                dep = [{"rolloutState": "COMPLETED", "updatedAt": updated_at}]
                return {"services": [{"deployments": dep}], "failures": []}

            def list_tasks(self, **kw):
                return {"taskArns": []}

        old = h.client
        h.client = lambda name: Ecs()
        try:
            return h.ecs_guards("c", ["api"])
        finally:
            h.client = old

    def test_a_deploy_just_finished_still_counts(self):
        import time as t
        just = datetime.fromtimestamp(t.time() - 60, timezone.utc)
        self.assertTrue(self.guards_with(just)[0])

    def test_an_old_deploy_does_not(self):
        import time as t
        old = datetime.fromtimestamp(t.time() - h.DEPLOY_QUIET_SEC - 60, timezone.utc)
        self.assertFalse(self.guards_with(old)[0])


class AllServicesGuardTests(unittest.TestCase):
    """D1-42: every service of the cluster is watched; a missing one (the
    pooler switched off) is not a failure, any other failure is unknown."""

    def guards(self, found, failures):
        class Ecs:
            def describe_services(self, cluster, services):
                return {"services": found, "failures": failures}

            def list_tasks(self, **kw):
                return {"taskArns": []}

        old = h.client
        h.client = lambda name: Ecs()
        try:
            return h.ecs_guards("c", ["api", "api-admin", "worker", "admin", "pgbouncer"])
        finally:
            h.client = old

    def test_missing_pooler_is_skipped(self):
        done = [{"deployments": [{"rolloutState": "COMPLETED"}]}]
        self.assertEqual(self.guards(done, [{"arn": "x/pgbouncer", "reason": "MISSING"}]), (False, False, False))

    def test_a_pooler_rollout_counts_as_deploying(self):
        rolling = [{"deployments": [{"rolloutState": "COMPLETED"}, {"rolloutState": "IN_PROGRESS"}]}]
        self.assertTrue(self.guards(rolling, [])[0])

    def test_other_failures_are_unknown(self):
        self.assertTrue(self.guards([], [{"arn": "x/api", "reason": "AccessDenied"}])[2])


class NightNowTests(unittest.TestCase):
    """14.11 (owner): «Авто» is tested within minutes, not at the next
    night. A manual invoke with {"mode": "night", "night_now": true} counts
    as inside the night window; the schedules never send the flag."""

    def test_flag_opens_the_window_by_day(self):
        noon = NOW + 10 * 3600  # NOW is 02:00 in Chicago
        self.assertFalse(h.night_window({"mode": "night"}, "America/Chicago", noon))
        self.assertTrue(h.night_window({"mode": "night", "night_now": True}, "America/Chicago", noon))
        self.assertTrue(h.night_window({"mode": "tick"}, "America/Chicago", NOW))

    def test_only_a_real_true_counts(self):
        noon = NOW + 10 * 3600
        for v in ("true", 1, "yes", None):
            self.assertFalse(h.night_window({"night_now": v}, "America/Chicago", noon))


ENV = {"LADDER": json.dumps(LADDER), "MIN_CLASS": "cache.t4g.micro", "MAX_CLASS": "cache.t4g.medium"}


class NightHoursTuningTests(unittest.TestCase):
    """14.11 (owner): the shrink window hours are part of TUNING, so a test
    can open the window now with the same apply and put it back later."""

    def test_default_window_is_01_to_06(self):
        cfg = h.load_config({**ENV, "TUNING": "{}"})
        self.assertEqual((cfg.night_start_h, cfg.night_end_h), (1, 6))

    def test_tuning_moves_the_window(self):
        cfg = h.load_config({**ENV, "TUNING": '{"night_start_h": 18, "night_end_h": 22}'})
        evening = NOW + 17 * 3600  # NOW = 02:00 Chicago -> 19:00
        self.assertTrue(h.night_window({}, "America/Chicago", evening, cfg))
        self.assertFalse(h.night_window({}, "America/Chicago", NOW, cfg))

    def test_a_window_across_midnight(self):
        cfg = h.load_config({**ENV, "TUNING": '{"night_start_h": 23, "night_end_h": 3}'})
        self.assertTrue(h.night_window({}, "America/Chicago", NOW, cfg))  # 02:00
        self.assertFalse(h.night_window({}, "America/Chicago", NOW + 10 * 3600, cfg))


class AdminTuningTests(unittest.TestCase):
    """14.11 (owner): every «Авто» number is changeable from the admin without
    a Terraform apply. The admin writes JSON into SSM `<prefix>/tuning`; the
    Lambda reads it on every run, over the Terraform TUNING (= the defaults).
    Only keys of tuning_schema.json, only inside their bounds."""

    def test_schema_matches_the_config(self):
        schema = h.tuning_schema()
        base = h.load_config({**ENV, "TUNING": "{}"})
        for k, s in schema.items():
            self.assertTrue(hasattr(base, k), k)
            v = getattr(base, k)
            v = int(v) if isinstance(v, bool) else v
            self.assertTrue(s["min"] <= v <= s["max"], f"{k} default {v} outside {s}")
            self.assertTrue(s["ru"], k)

    def test_valid_values_apply_bad_ones_are_skipped(self):
        base = h.load_config({**ENV, "TUNING": '{"down_window_h": 2}'})
        cfg, skipped = h.apply_admin_tuning(
            base,
            json.dumps({"down_window_h": 3, "night_start_h": 19, "single_node_up": 0,
                        "up_cpu_pct": 5, "period_s": 60, "nope": 1}),
        )
        self.assertEqual(cfg.down_window_h, 3)  # the admin wins over Terraform
        self.assertEqual(cfg.night_start_h, 19)
        self.assertIs(cfg.single_node_up, False)
        self.assertEqual(cfg.up_cpu_pct, base.up_cpu_pct)  # 5 < min 10: skipped
        self.assertEqual(cfg.period_s, base.period_s)  # not an admin knob
        self.assertEqual(sorted(skipped), ["nope", "period_s", "up_cpu_pct"])

    def test_missing_or_broken_parameter_changes_nothing(self):
        base = h.load_config({**ENV, "TUNING": "{}"})
        for raw in (None, "", "not json", "[1,2]"):
            cfg, _ = h.apply_admin_tuning(base, raw)
            self.assertEqual(cfg, base)
