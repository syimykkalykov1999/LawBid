"""The handler with fake AWS clients: the wiring, not the maths."""

import os
import sys
import unittest
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import handler as h  # noqa: E402

ENV = {
    "VPC_ID": "vpc-1",
    "MANAGED_TAG": "x-endpoints-autoscale",
    "AWS_REGION": "us-east-1",
    "SERVICES": "ecr.api,logs",
    "NAT_IDS": "nat-1",
    "MODE_PARAM": "/m",
    "CEILING_PARAM": "/c",
    "STATE_PARAM": "/s",
    "TOPIC_ARN": "arn:sns",
    "SUBNET_IDS": "subnet-1",
    "SG_ID": "sg-1",
    "NAME": "x",
}


class Ssm:
    exceptions = type("E", (), {"ParameterNotFound": KeyError})

    def __init__(self, mode="on"):
        self.p = {"/m": mode, "/c": "2", "/s": "{}"}

    def get_parameter(self, Name):
        if Name not in self.p:
            raise KeyError
        return {"Parameter": {"Value": self.p[Name]}}

    def put_parameter(self, Name, Value, **_):
        self.p[Name] = Value


class Ec2:
    def __init__(self, existing=()):
        self.created, self.deleted, self.existing = [], [], list(existing)

    def describe_vpc_endpoints(self, **_):
        return {"VpcEndpoints": self.existing}

    def create_vpc_endpoint(self, **kw):
        self.created.append(kw["ServiceName"])

    def delete_vpc_endpoints(self, VpcEndpointIds):
        self.deleted += VpcEndpointIds


class Cw:
    def __init__(self, gb_per_hour):
        self.b = gb_per_hour * 1e9

    def get_metric_data(self, MetricDataQueries, StartTime, EndTime, **_):
        out = []
        for q in MetricDataQueries:
            period = q["MetricStat"]["Period"]
            n = int((EndTime - StartTime).total_seconds() // period)
            ts = [StartTime + timedelta(seconds=period * i) for i in range(n)]
            val = self.b * (period / 3600)
            out.append({"Id": q["Id"], "Timestamps": ts, "Values": [val] * n})
        return {"MetricDataResults": out}


class Sns:
    def __init__(self):
        self.sent = []

    def publish(self, **kw):
        self.sent.append(kw["Message"])


class Handler(unittest.TestCase):
    def setUp(self):
        h._clients.clear()

    def run_it(self, mode="on", gb=2.0, existing=()):
        h._clients.update(
            ssm=Ssm(mode), ec2=Ec2(existing), cloudwatch=Cw(gb), sns=Sns()
        )
        h.lambda_handler({}, None, env=ENV)
        return h._clients

    def test_busy_creates_up_to_ceiling(self):
        c = self.run_it(gb=2.0)
        self.assertEqual(
            c["ec2"].created,
            ["com.amazonaws.us-east-1.ecr.api", "com.amazonaws.us-east-1.logs"],
        )
        self.assertEqual(len(c["sns"].sent), 1)

    def test_dry_run_only_mails(self):
        c = self.run_it(mode="dry-run", gb=2.0)
        self.assertEqual(c["ec2"].created, [])
        self.assertIn("пробный", c["sns"].sent[0])

    def test_quiet_week_deletes_ours(self):
        ex = [
            {
                "ServiceName": "com.amazonaws.us-east-1.logs",
                "VpcEndpointId": "vpce-1",
                "State": "available",
            }
        ]
        c = self.run_it(gb=0.01, existing=ex)
        self.assertEqual(c["ec2"].deleted, ["vpce-1"])


if __name__ == "__main__":
    unittest.main()
