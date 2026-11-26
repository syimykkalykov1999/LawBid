"""Item 29: the rotation steps of a Serverless Valkey user password.
    python3 -m unittest discover -s infra/modules/secret-rotation/lambda/tests
"""
import importlib
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


def load_rotator():
    boto3 = types.ModuleType("boto3")
    boto3.client = lambda name: mock.MagicMock(name=name)
    exc = types.ModuleType("botocore.exceptions")
    exc.ClientError = FakeClientError
    botocore = types.ModuleType("botocore")
    botocore.exceptions = exc
    sys.modules.update({"boto3": boto3, "botocore": botocore, "botocore.exceptions": exc})
    os.environ.update(
        REDIS_GROUPS=json.dumps({"REDIS_URL": "g"}),
        VALKEY_USERS=json.dumps({"REDIS_SERVERLESS_URL": "lb-svl-default"}),
        REDIS_WAIT_SECONDS="5",
    )
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    sys.modules.pop("rotator", None)
    import rotator  # noqa: E402

    return rotator


r = load_rotator()


class ValkeyUserRotation(unittest.TestCase):
    def setUp(self):
        # test_ops.py replaces keylogic functions on the shared module.
        importlib.reload(r.kl)
        r.ec = mock.MagicMock()
        r.sm = mock.MagicMock()
        r.time.sleep = lambda s: None
        r.ec.describe_users.return_value = {"Users": [{"Status": "active"}]}
        values = {
            "AWSCURRENT": "rediss://default:old-test-password@h:6379",
            "AWSPENDING": "rediss://default:new-test-password@h:6379",
        }

        def get_secret_value(**kw):
            stage = kw.get("VersionStage") or "AWSPENDING"
            return {"SecretString": values[stage]}

        r.sm.get_secret_value.side_effect = get_secret_value

    def test_set_adds_the_new_password_beside_the_old(self):
        r.valkey_user_set("arn:s", "tok", "REDIS_SERVERLESS_URL")
        r.ec.modify_user.assert_called_once_with(
            UserId="lb-svl-default",
            AuthenticationMode={"Type": "password", "Passwords": ["old-test-password", "new-test-password"]},
        )
        r.ec.modify_replication_group.assert_not_called()

    def test_test_step_needs_an_active_user(self):
        r.valkey_user_test("arn:s", "tok", "REDIS_SERVERLESS_URL")
        r.ec.describe_users.return_value = {"Users": [{"Status": "modifying"}]}
        with self.assertRaises(RuntimeError):
            r.valkey_user_test("arn:s", "tok", "REDIS_SERVERLESS_URL")

    def test_the_handler_routes_the_serverless_secret_to_the_user_steps(self):
        r.sm.describe_secret.return_value = {
            "RotationEnabled": True,
            "Name": "lawbid-prod/REDIS_SERVERLESS_URL",
            "VersionIdsToStages": {"tok": ["AWSPENDING"]},
        }
        r.lambda_handler({"SecretId": "arn:s", "ClientRequestToken": "tok", "Step": "setSecret"}, None)
        r.ec.modify_user.assert_called_once()
        r.ec.modify_replication_group.assert_not_called()


if __name__ == "__main__":
    unittest.main()
