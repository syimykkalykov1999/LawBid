"""Run: python3 -m unittest discover -s infra/modules/signing-guard/lambda/tests"""
import os
import sys
import types
import unittest
from unittest import mock

os.environ.update(ALERTS_TOPIC_ARN="arn:topic", ECR_REGISTRY_HOST="1.dkr.ecr.us-east-1.amazonaws.com")


class NotFound(Exception):
    pass


class FakeEcr:
    exceptions = types.SimpleNamespace(ImageNotFoundException=NotFound)

    def __init__(self, signed):
        self.signed = signed

    def describe_images(self, repositoryName, imageIds):
        tag = imageIds[0].get("imageTag", "")
        if tag.endswith(".sig"):
            if self.signed:
                return {"imageDetails": [{}]}
            raise NotFound()
        return {"imageDetails": [{"imageDigest": "sha256:abc"}]}


class Sns:
    def __init__(self):
        self.sent = []

    def publish(self, **kw):
        self.sent.append(kw)


def load(signed):
    boto = types.SimpleNamespace(client=lambda name: FakeEcr(signed) if name == "ecr" else Sns())
    with mock.patch.dict(sys.modules, {"boto3": boto}):
        sys.modules.pop("handler", None)
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
        import handler
        return handler


EVENT = {"detail": {"lastStatus": "RUNNING", "taskArn": "t", "containers": [
    {"image": "1.dkr.ecr.us-east-1.amazonaws.com/lawbid-api:abc123"},
    {"image": "clamav/clamav:1.4"}]}}


class T(unittest.TestCase):
    def test_signed_is_quiet(self):
        h = load(True)
        self.assertEqual(h.lambda_handler(EVENT, None)["unsigned"], [])
        self.assertEqual(h.sns.sent, [])

    def test_unsigned_alerts(self):
        h = load(False)
        r = h.lambda_handler(EVENT, None)
        self.assertEqual(len(r["unsigned"]), 1)
        self.assertEqual(len(h.sns.sent), 1)

    def test_not_running_ignored(self):
        h = load(False)
        self.assertEqual(h.lambda_handler({"detail": {"lastStatus": "PENDING"}}, None), {"checked": 0})


if __name__ == "__main__":
    unittest.main()
