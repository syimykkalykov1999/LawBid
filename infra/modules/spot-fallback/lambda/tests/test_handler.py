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
    def __init__(self, mode=None):
        self.mode = mode

    def get_object(self, Bucket, Key):
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


def wire(services, mode="on", state="{}", control=None):
    fakes = {"ssm": Ssm(mode, state), "ecs": Ecs(services), "s3": S3(control), "sns": Sns()}
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


if __name__ == "__main__":
    unittest.main()
