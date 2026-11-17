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

    def test_ceiling_param_can_only_lower_the_ceiling(self):
        os.environ["MAX_CLASS_PARAM"] = "/x/max-class"
        self.addCleanup(os.environ.pop, "MAX_CLASS_PARAM", None)
        f = Fake()
        f.param["/x/max-class"] = "db.t4g.micro"  # money allows only the smallest size
        self.run_with(f)
        self.assertEqual([c for c in f.calls if c[0] == "modify"], [])

    def test_ceiling_param_never_raises_and_ignores_garbage(self):
        os.environ["MAX_CLASS_PARAM"] = "/x/max-class"
        self.addCleanup(os.environ.pop, "MAX_CLASS_PARAM", None)
        # "db.r7g.xlarge": a value written before the 15.11 r7g -> r8g move.
        for value in ("db.r8g.2xlarge", "db.r7g.xlarge", "nonsense", ""):
            f = Fake()
            f.param["/x/max-class"] = value
            self.assertEqual(self.run_with(f)["to"], "db.t4g.small")
        f = Fake()  # parameter missing: Terraform ceiling alone
        self.assertEqual(self.run_with(f)["to"], "db.t4g.small")


class ReplicaFake(Fake):
    """A primary with read copies (owner row 6): each id has its own class."""

    def __init__(self, primary="db.t4g.micro", replicas=None, foreign=(), fail=False, **kw):
        super().__init__(**kw)
        self.classes = {"db": primary, **(replicas or {"db-replica-1": "db.t4g.micro"})}
        self.rstatus = {}
        self.foreign, self.fail = list(foreign), fail

    def describe_db_instances(self, DBInstanceIdentifier):
        i = DBInstanceIdentifier
        row = {"DBInstanceClass": self.classes[i], "MultiAZ": True,
               "DBInstanceStatus": self.status if i == "db" else self.rstatus.get(i, "available")}
        if i == "db":
            row["ReadReplicaDBInstanceIdentifiers"] = [k for k in self.classes if k != "db"] + self.foreign
        return {"DBInstances": [row]}

    def modify_db_instance(self, **kw):
        if self.fail and kw["DBInstanceIdentifier"] != "db":
            raise RuntimeError("AccessDenied")
        self.calls.append(("modify", kw))

    def modified(self):
        return [(c[1]["DBInstanceIdentifier"], c[1]["DBInstanceClass"]) for c in self.calls if c[0] == "modify"]


class ReplicaFollowTests(HandlerTests):
    """Owner row 6 (13.11): read copies keep the primary's class; grow = copies
    first, shrink = primary first and the copies on a later tick."""

    def test_grow_resizes_the_copy_first_then_the_primary(self):
        f = ReplicaFake()
        self.assertEqual(self.run_with(f)["to"], "db.t4g.small")
        self.assertEqual(f.modified(), [("db-replica-1", "db.t4g.small"), ("db", "db.t4g.small")])

    def test_calm_tick_brings_a_smaller_copy_up_to_the_primary(self):
        f = ReplicaFake(primary="db.t4g.medium", cpu=10.0)
        self.run_with(f)
        self.assertEqual(f.modified(), [("db-replica-1", "db.t4g.medium")])
        self.assertTrue(any("подстроена" in c[1]["Message"] for c in f.calls if c[0] == "publish"))

    def test_copy_follows_the_primary_down_only_after_it_settled(self):
        f = ReplicaFake(primary="db.t4g.micro", replicas={"db-replica-1": "db.t4g.small"}, cpu=10.0, status="modifying")
        self.run_with(f)
        self.assertEqual(f.modified(), [])  # primary still resizing: the copy waits
        f.status = "available"
        self.run_with(f)
        self.assertEqual(f.modified(), [("db-replica-1", "db.t4g.micro")])

    def test_copy_already_equal_is_left_alone(self):
        f = ReplicaFake(cpu=10.0)
        self.run_with(f)
        self.assertEqual(f.calls, [])

    def test_busy_copy_is_not_touched(self):
        f = ReplicaFake(primary="db.t4g.small", cpu=10.0)
        f.rstatus["db-replica-1"] = "modifying"
        self.run_with(f)
        self.assertEqual(f.modified(), [])

    def test_foreign_and_cross_region_copies_are_never_resized(self):
        f = ReplicaFake(primary="db.t4g.small", cpu=10.0,
                        foreign=["arn:aws:rds:us-west-2:1:db:db-replica-9", "reporting-copy"])
        self.run_with(f)
        self.assertEqual(f.modified(), [("db-replica-1", "db.t4g.small")])

    def test_deploy_holds_the_copy_too(self):
        f = ReplicaFake(primary="db.t4g.small", cpu=10.0, deploying=True)
        self.run_with(f)
        self.assertEqual(f.modified(), [])

    def test_switch_off_holds_the_copy(self):
        f = ReplicaFake(primary="db.t4g.small", cpu=10.0, mode="off")
        self.run_with(f)
        self.assertEqual(f.calls, [])

    def test_dry_run_only_tells_the_owner(self):
        f = ReplicaFake(primary="db.t4g.small", cpu=10.0, mode="dry-run")
        self.run_with(f)
        self.assertEqual(f.modified(), [])
        self.assertTrue(any("ПРОБНЫЙ" in c[1]["Message"] for c in f.calls if c[0] == "publish"))

    def test_failing_copy_never_blocks_the_primary_and_notifies_once_a_day(self):
        f = ReplicaFake(fail=True)
        self.assertEqual(self.run_with(f)["to"], "db.t4g.small")
        self.assertEqual(f.modified(), [("db", "db.t4g.small")])
        fails = [c for c in f.calls if c[0] == "publish" and "копии базы" in c[1]["Message"]]
        self.assertEqual(len(fails), 1)
        self.assertIn("replica_fail", json.loads(f.param["/x/state"])["notified"])

    def test_force_up_moves_the_copy_first(self):
        f = ReplicaFake()
        self.run_with(f, {"action": "force", "class": "db.t4g.medium"})
        self.assertEqual(f.modified(), [("db-replica-1", "db.t4g.medium"), ("db", "db.t4g.medium")])

    def test_force_down_moves_only_the_primary(self):
        f = ReplicaFake(primary="db.t4g.medium", replicas={"db-replica-1": "db.t4g.medium"})
        self.run_with(f, {"action": "force", "class": "db.t4g.micro"})
        self.assertEqual(f.modified(), [("db", "db.t4g.micro")])

    def test_admin_button_copy_follows_too(self):
        # Row 196 (16.11): the copy of the admin button (`<db>-readreplica`)
        # stayed at its first class while the primary grew.
        f = ReplicaFake(primary="db.t4g.medium", cpu=10.0,
                        replicas={"db-readreplica": "db.t4g.micro", "db-replica-1": "db.t4g.medium"})
        self.run_with(f)
        self.assertEqual(f.modified(), [("db-readreplica", "db.t4g.medium")])

    def test_status_lists_the_copies(self):
        f = ReplicaFake()
        self.assertEqual(self.run_with(f, {"action": "status"})["replicas"], ["db-replica-1"])


if __name__ == "__main__":
    unittest.main()


class DeployQuietTests(unittest.TestCase):
    """13.11: a rollout ECS calls COMPLETED still holds a resize for
    DEPLOY_QUIET_SEC (the deploy job keeps smoke-testing prod)."""

    def guards_with(self, created_at, updated_at=None):
        class Ecs:
            def describe_services(self, cluster, services):
                dep = [{"rolloutState": "COMPLETED", "createdAt": created_at,
                        "updatedAt": updated_at or created_at}]
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

    def test_autoscaling_bumping_updated_at_does_not_count(self):
        # 15.11 prod: api deployment created 12:48Z, COMPLETED; Application
        # Auto Scaling 1->2 moved its updatedAt to 13:02Z. Not a rollout.
        import time as t
        created = datetime.fromtimestamp(t.time() - h.DEPLOY_QUIET_SEC - 60, timezone.utc)
        bumped = datetime.fromtimestamp(t.time() - 60, timezone.utc)
        self.assertFalse(self.guards_with(created, bumped)[0])

    def test_smoke_window_after_rollout_still_counts(self):
        # Rollout done 10 min after it started, smoke runs 15 min later:
        # 25 min after createdAt the resize still waits.
        import time as t
        created = datetime.fromtimestamp(t.time() - 25 * 60, timezone.utc)
        self.assertTrue(self.guards_with(created)[0])


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


ENV = {"LADDER": json.dumps(LADDER), "MIN_CLASS": "db.t4g.micro", "MAX_CLASS": "db.t4g.medium"}


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
                        "up_cpu_pct": 0, "period_s": 60, "nope": 1}),
        )
        self.assertEqual(cfg.down_window_h, 3)  # the admin wins over Terraform
        self.assertEqual(cfg.night_start_h, 19)
        self.assertIs(cfg.single_node_up, False)
        self.assertEqual(cfg.up_cpu_pct, base.up_cpu_pct)  # 0 < floor 1: skipped
        self.assertEqual(cfg.period_s, base.period_s)  # not an admin knob
        self.assertEqual(sorted(skipped), ["nope", "period_s", "up_cpu_pct"])

    def test_missing_or_broken_parameter_changes_nothing(self):
        base = h.load_config({**ENV, "TUNING": "{}"})
        for raw in (None, "", "not json", "[1,2]"):
            cfg, _ = h.apply_admin_tuning(base, raw)
            self.assertEqual(cfg, base)
