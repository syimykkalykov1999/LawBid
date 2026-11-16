"""The handler with fake AWS clients: the wiring, not the maths."""

import io
import json
import os
import sys
import unittest
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import handler as h  # noqa: E402

ENV = {
    "CLUSTER": "lawbid-prod",
    "SERVICES": json.dumps({"api": {"base": 1, "fargate": 1, "spot": 4}, "worker": {"base": 1, "fargate": 1, "spot": 4}}),
    "MODE_PARAM": "/m",
    "STATE_PARAM": "/s",
    "TOPIC_ARN": "arn:sns",
    "CONTROLS_BUCKET": "docs",
    "CONTROLS_KEY": "ops/scale-controls.json",
}
NORMAL = [{"capacityProvider": "FARGATE", "base": 1, "weight": 1}, {"capacityProvider": "FARGATE_SPOT", "base": 0, "weight": 4}]
FALLBACK = [{"capacityProvider": "FARGATE", "base": 1, "weight": 1}, {"capacityProvider": "FARGATE_SPOT", "base": 0, "weight": 0}]


class Ssm:
    exceptions = type("E", (), {"ParameterNotFound": KeyError})

    def __init__(self, mode="on", state="{}"):
        self.p = {"/m": mode, "/s": state}

    def get_parameter(self, Name):
        if Name not in self.p:
            raise KeyError
        return {"Parameter": {"Value": self.p[Name]}}

    def put_parameter(self, Name, Value, **_):
        self.p[Name] = Value


class Ecs:
    def __init__(self, services):
        self.services, self.updates = services, []

    def describe_services(self, cluster, services):
        return {"services": [s for s in self.services if s["serviceName"] in services]}

    def update_service(self, **kw):
        self.updates.append(kw)


class S3:
    def __init__(self, mode=None, body=None):
        self.mode, self.body = mode, body

    def get_object(self, Bucket, Key):
        if self.body is not None:
            return {"Body": io.BytesIO(json.dumps(self.body).encode())}
        if self.mode is None:
            raise RuntimeError("no object")
        return {"Body": io.BytesIO(json.dumps({"spot_fallback": {"mode": self.mode}}).encode())}


class Sns:
    def __init__(self):
        self.sent = []

    def publish(self, **kw):
        self.sent.append(kw["Message"])


def svc(name, strategy, running=5, desired=5, events=()):
    return {
        "serviceName": name,
        "status": "ACTIVE",
        "capacityProviderStrategy": strategy,
        "runningCount": running,
        "desiredCount": desired,
        "events": list(events),
    }


def wire(services, mode="on", state="{}", control=None, body=None):
    fakes = {"ssm": Ssm(mode, state), "ecs": Ecs(services), "s3": S3(control, body), "sns": Sns()}
    h._clients.clear()
    h._clients.update(fakes)
    return fakes


PLACEMENT = {
    "detail-type": "ECS Service Action",
    "source": "aws.ecs",
    "resources": ["arn:aws:ecs:us-east-1:111122223333:service/lawbid-prod/api"],
    "detail": {
        "eventType": "ERROR",
        "eventName": "SERVICE_TASK_PLACEMENT_FAILURE",
        "capacityProviderArns": ["arn:aws:ecs:us-east-1:111122223333:capacity-provider/FARGATE_SPOT"],
        "reason": "RESOURCE:FARGATE",
    },
}


class Handler(unittest.TestCase):
    def test_placement_failure_moves_only_that_service_to_regular(self):
        f = wire([svc("api", NORMAL, 3, 5), svc("worker", NORMAL)])
        h.lambda_handler(PLACEMENT, None, ENV)
        self.assertEqual(len(f["ecs"].updates), 1)
        u = f["ecs"].updates[0]
        self.assertEqual(u["service"], "api")
        self.assertEqual(u["capacityProviderStrategy"], FALLBACK)
        self.assertTrue(u["forceNewDeployment"])
        self.assertIn("api", json.loads(f["ssm"].p["/s"]))
        self.assertEqual(len(f["sns"].sent), 1)

    def test_other_placement_failures_are_ignored(self):
        f = wire([svc("api", NORMAL)])
        ev = json.loads(json.dumps(PLACEMENT))
        ev["detail"]["capacityProviderArns"] = []
        ev["detail"]["reason"] = "RESOURCE:ENI"
        h.lambda_handler(ev, None, ENV)
        self.assertEqual(f["ecs"].updates, [])

    def test_dry_run_only_tells(self):
        f = wire([svc("api", NORMAL)], mode="dry-run")
        h.lambda_handler(PLACEMENT, None, ENV)
        self.assertEqual(f["ecs"].updates, [])
        self.assertIn("пробный", f["sns"].sent[0])

    def test_switch_off_does_nothing(self):
        f = wire([svc("api", NORMAL)], mode="off")
        h.lambda_handler(PLACEMENT, None, ENV)
        self.assertEqual(f["ecs"].updates, [])

    def test_owner_control_off_is_hands_off(self):
        f = wire([svc("api", NORMAL)], control="off")
        h.lambda_handler(PLACEMENT, None, ENV)
        self.assertEqual(f["ecs"].updates, [])

    def test_tick_restores_after_hold_with_rolling_deploy(self):
        old = (datetime.now(timezone.utc) - timedelta(minutes=45)).isoformat()
        state = json.dumps({"api": {"fallback_since": old, "last_failure": old, "strikes": 1}})
        f = wire([svc("api", FALLBACK), svc("worker", NORMAL)], state=state)
        h.lambda_handler({"mode": "tick"}, None, ENV)
        self.assertEqual(len(f["ecs"].updates), 1)
        u = f["ecs"].updates[0]
        self.assertEqual((u["service"], u["capacityProviderStrategy"]), ("api", NORMAL))
        self.assertTrue(u["forceNewDeployment"])
        self.assertIsNone(json.loads(f["ssm"].p["/s"])["api"]["fallback_since"])

    def test_tick_backstop_reads_the_service_events(self):
        ev = {"createdAt": datetime.now(timezone.utc) - timedelta(minutes=1), "message": "(service worker) was unable to place a task. Reason: Capacity is unavailable at this time."}
        f = wire([svc("api", NORMAL), svc("worker", NORMAL, 1, 3, [ev])])
        h.lambda_handler({"mode": "tick"}, None, ENV)
        self.assertEqual([u["service"] for u in f["ecs"].updates], ["worker"])

    def test_status_never_changes_anything(self):
        f = wire([svc("api", NORMAL, 1, 5)])
        out = h.lambda_handler(dict(PLACEMENT, action="status"), None, ENV)
        self.assertEqual(f["ecs"].updates, [])
        self.assertEqual(out["decisions"]["api"]["action"], "fallback")


class AdminTuningTests(unittest.TestCase):
    """15.11 (owner, row 20): the quiet hold and the other numbers from the
    admin (SSM `<prefix>/tuning`, read on every run over the Terraform
    TUNING), the same way as the endpoint autoscaler."""

    def test_schema_matches_the_config(self):
        import dataclasses
        import decision as dd
        defaults = {f.name: f.default for f in dataclasses.fields(dd.Config)}
        self.assertEqual(sorted(h.tuning_schema()), sorted(defaults))
        for k, s in h.tuning_schema().items():
            self.assertTrue(s["min"] <= defaults[k] <= s["max"], k)

    def test_valid_values_apply_bad_ones_are_skipped(self):
        import decision as dd
        cfg, skipped = h.apply_admin_tuning(dd.Config(), json.dumps({"restore_after_min": 2, "gap_min": 0, "x": 1}))
        self.assertEqual(cfg.restore_after_min, 2)
        self.assertEqual(cfg.gap_min, dd.Config().gap_min)
        self.assertEqual(sorted(skipped), ["gap_min", "x"])

    def test_short_hold_from_the_admin_restores_on_the_next_tick(self):
        old = (datetime.now(timezone.utc) - timedelta(minutes=3)).isoformat()
        state = json.dumps({"api": {"fallback_since": old, "last_failure": old, "strikes": 1}})
        f = wire([svc("api", FALLBACK), svc("worker", NORMAL)], state=state)
        f["ssm"].p["/t"] = json.dumps({"restore_after_min": 2})
        h.lambda_handler({"mode": "tick"}, None, dict(ENV, TUNING_PARAM="/t"))
        self.assertEqual([(u["service"], u["capacityProviderStrategy"]) for u in f["ecs"].updates], [("api", NORMAL)])

    def test_without_the_parameter_the_default_hold_stays(self):
        old = (datetime.now(timezone.utc) - timedelta(minutes=3)).isoformat()
        state = json.dumps({"api": {"fallback_since": old, "last_failure": old, "strikes": 1}})
        f = wire([svc("api", FALLBACK), svc("worker", NORMAL)], state=state)
        h.lambda_handler({"mode": "tick"}, None, dict(ENV, TUNING_PARAM="/missing"))
        self.assertEqual(f["ecs"].updates, [])



class AdminSplitTests(unittest.TestCase):
    """Owner 15.11 («надеюсь я могу настраивать … спот … сделай
    настраиваемыми»): the admin's Spot split per service arrives in the
    control file (`spot_fallback.want`, economy job) and is the normal
    strategy the tick brings each service to (one writer of the strategy)."""

    def test_admin_split_is_rolled_out_by_the_tick(self):
        body = {"spot_fallback": {"mode": "auto", "want": {"api": {"base": 2, "fargate": 1, "spot": 2}}}}
        f = wire([svc("api", NORMAL), svc("worker", NORMAL)], body=body)
        h.lambda_handler({"mode": "tick"}, None, ENV)
        self.assertEqual(len(f["ecs"].updates), 1)
        u = f["ecs"].updates[0]
        self.assertEqual(u["service"], "api")
        self.assertEqual(
            u["capacityProviderStrategy"],
            [{"capacityProvider": "FARGATE", "base": 2, "weight": 1}, {"capacityProvider": "FARGATE_SPOT", "base": 0, "weight": 2}],
        )
        self.assertTrue(u["forceNewDeployment"])

    def test_service_already_on_the_admin_split_is_left_alone(self):
        live = [{"capacityProvider": "FARGATE", "base": 2, "weight": 1}, {"capacityProvider": "FARGATE_SPOT", "base": 0, "weight": 2}]
        body = {"spot_fallback": {"want": {"api": {"base": 2, "fargate": 1, "spot": 2}}}}
        f = wire([svc("api", live), svc("worker", NORMAL)], body=body)
        h.lambda_handler({"mode": "tick"}, None, ENV)
        self.assertEqual(f["ecs"].updates, [])

    def test_no_spot_split_does_not_redeploy_every_tick(self):
        body = {"spot_fallback": {"want": {"api": {"spot": 0}}}}
        f = wire([svc("api", NORMAL), svc("worker", NORMAL)], body=body)
        h.lambda_handler({"mode": "tick"}, None, ENV)
        self.assertEqual([u["capacityProviderStrategy"] for u in f["ecs"].updates], [FALLBACK])
        # Next ticks: the live strategy is the owner's, nothing more happens.
        f["ecs"].services = [svc("api", FALLBACK), svc("worker", NORMAL)]
        f["ecs"].updates = []
        for _ in range(3):
            h.lambda_handler({"mode": "tick"}, None, ENV)
        self.assertEqual(f["ecs"].updates, [])

    def test_bad_admin_numbers_keep_terraform(self):
        import decision as dd
        tf = dd.Want(1, 1, 4)
        for bad in ({"spot": -1}, {"fargate": 1001}, {"base": 1.5}, {"fargate": 0, "spot": 0}, {"spot": True}, "x"):
            self.assertEqual(h.admin_want(tf, bad), tf, bad)
        self.assertEqual(h.admin_want(tf, {"spot": 0}), dd.Want(1, 1, 0))

    def test_unreadable_control_file_keeps_terraform_and_auto(self):
        f = wire([svc("api", NORMAL), svc("worker", NORMAL)])
        out = h.lambda_handler({"mode": "tick"}, None, ENV)
        self.assertEqual(out["control"], "auto")
        self.assertEqual(f["ecs"].updates, [])


if __name__ == "__main__":
    unittest.main()
