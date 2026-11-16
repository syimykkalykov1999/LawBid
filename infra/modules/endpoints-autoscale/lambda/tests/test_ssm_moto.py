"""Owner 14.11: the admin -> SSM -> Lambda path with a real boto3 client
against moto's SSM (Apache-2.0), not a hand-written fake: the parameter
the admin writes is read by the Lambda's own code. Skipped where moto is
not installed (CI installs it: .github/workflows/api-ci.yml).

    pip install "moto[ssm]==5.2.5" "boto3==1.43.126"
"""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import handler as h  # noqa: E402

try:
    import boto3
    from moto import mock_aws
except ImportError:  # pragma: no cover
    mock_aws = None

PARAM = "/lawbid-test/autoscale/tuning"
_ENV = {}
_PICK = {"cooldown_h": 2.0}


@unittest.skipIf(mock_aws is None, "moto not installed")
class SsmReadPath(unittest.TestCase):
    def setUp(self):
        os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")
        os.environ.setdefault("AWS_ACCESS_KEY_ID", "testing")
        os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "testing")
        self.mock = mock_aws()
        self.mock.start()
        h._clients.clear()  # real boto3 clients, inside the mock

    def tearDown(self):
        h._clients.clear()
        self.mock.stop()

    def base(self):
        if hasattr(h, "load_config"):
            return h.load_config({**_ENV, "TUNING": "{}"})
        import decision as d
        return d.Config()

    def test_the_admin_value_reaches_the_lambda(self):
        key, val = next(iter(_PICK.items()))
        boto3.client("ssm").put_parameter(Name=PARAM, Value=json.dumps({key: val, "nope": 1}), Type="String")
        cfg = h.read_admin_tuning(self.base(), {"TUNING_PARAM": PARAM})
        self.assertEqual(getattr(cfg, key), val)

    def test_no_parameter_keeps_the_defaults(self):
        base = self.base()
        self.assertEqual(h.read_admin_tuning(base, {"TUNING_PARAM": PARAM}), base)

    def test_broken_json_keeps_the_defaults(self):
        boto3.client("ssm").put_parameter(Name=PARAM, Value="{not json", Type="String")
        base = self.base()
        self.assertEqual(h.read_admin_tuning(base, {"TUNING_PARAM": PARAM}), base)
