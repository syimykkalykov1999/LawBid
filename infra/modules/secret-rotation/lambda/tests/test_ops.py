"""D1-39: restarts after a rotation are retried, and the old Redis token is
dropped only after every service runs tasks started after the rotation."""
import json
import os
import sys
import types
import unittest
from unittest import mock


class FakeClientError(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.response = {"Error": {"Code": code}}


def load_ops():
    boto3 = types.ModuleType("boto3")
    boto3.client = lambda name: mock.MagicMock(name=name)
    exc = types.ModuleType("botocore.exceptions")
    exc.ClientError = FakeClientError
    botocore = types.ModuleType("botocore")
    botocore.exceptions = exc
    sys.modules.update({"boto3": boto3, "botocore": botocore, "botocore.exceptions": exc})
    os.environ.update(
        CONFIG=json.dumps(
            {
                "cluster": "c",
                "services": ["api", "api-admin", "worker", "pgbouncer"],
                "strict_hours": 24,
                "grace_hours": 24,
                "jwt_retire_days": 30,
                "redis": {"REDIS_URL": {"arn": "arn:r", "group": "g"}},
                "tracked": [],
            }
        ),
        STATE_PARAM="/p",
        METRIC_NAMESPACE="ns",
    )
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    sys.modules.pop("ops", None)
    import ops  # noqa: E402

    return ops


ops = load_ops()


def dep(created, state="COMPLETED"):
    return {"status": "PRIMARY", "createdAt": created, "rolloutState": state}


class Rolls(unittest.TestCase):
    def setUp(self):
        ops.ecs = mock.MagicMock()
        ops.ec = mock.MagicMock()
        ops.sns = mock.MagicMock()
        ops.TOPIC = ""

    def test_missing_services_are_skipped_and_the_roll_is_done(self):
        def upd(cluster, service, forceNewDeployment):
            if service == "pgbouncer":
                raise FakeClientError("ServiceNotFoundException")

        ops.ecs.update_service.side_effect = upd
        state = {}
        ops.roll_services(state, "redis:REDIS_URL")
        rolled = [c.kwargs["service"] for c in ops.ecs.update_service.call_args_list]
        self.assertEqual(rolled, ["api", "api-admin", "worker", "pgbouncer"])
        self.assertNotIn("roll_owed", state)
        self.assertIn("rolled_at", state)

    def test_a_failed_restart_is_owed_and_retried_next_tick(self):
        ops.ecs.update_service.side_effect = [None, FakeClientError("ThrottlingException")]
        state = {}
        with self.assertRaises(FakeClientError):
            ops.roll_services(state, "redis:REDIS_URL")
        self.assertEqual(state["roll_owed"]["why"], "redis:REDIS_URL")
        ops.ecs.update_service.side_effect = None
        ops.retry_owed_roll(state)
        self.assertNotIn("roll_owed", state)

    def test_old_token_waits_for_every_service(self):
        t = 1000.0
        state = {"redis": {"REDIS_URL": {"version": "v2", "rotated_at": t, "strict_at": t + 10}}}
        ops.current_version = lambda arn: "v2"
        ops.now = lambda: t + 20
        # api-admin still runs a deployment from before the rotation
        ops.ecs.describe_services.return_value = {
            "services": [
                {"status": "ACTIVE", "deployments": [dep(t + 1)]},
                {"status": "ACTIVE", "deployments": [dep(t - 100)]},
            ]
        }
        ops.reconcile_redis(state)
        ops.ec.modify_replication_group.assert_not_called()
        self.assertIn("strict_at", state["redis"]["REDIS_URL"])
        # owed restart blocks too
        ops.ecs.describe_services.return_value = {"services": [{"status": "ACTIVE", "deployments": [dep(t + 1)]}]}
        state["roll_owed"] = {"since": t, "why": "x"}
        ops.reconcile_redis(state)
        ops.ec.modify_replication_group.assert_not_called()
        # all rolled after the rotation: SET
        state.pop("roll_owed")
        ops.secret_text = lambda arn: "rediss://:tok-test-token@h:6379"
        ops.kl.redis_url_token = lambda url: "tok-test-token"
        ops.reconcile_redis(state)
        ops.ec.modify_replication_group.assert_called_once()
        self.assertNotIn("strict_at", state["redis"]["REDIS_URL"])

    def test_a_rollout_in_progress_is_not_rolled(self):
        ops.ecs.describe_services.return_value = {
            "services": [{"status": "ACTIVE", "deployments": [dep(5.0, "IN_PROGRESS")]}]
        }
        self.assertFalse(ops.services_rolled_since(1.0))
        ops.ecs.describe_services.return_value = {
            "services": [{"status": "ACTIVE", "deployments": [dep(5.0), {"status": "ACTIVE", "createdAt": 0.5}]}]
        }
        self.assertFalse(ops.services_rolled_since(1.0))


if __name__ == "__main__":
    unittest.main()
