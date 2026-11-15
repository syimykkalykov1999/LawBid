"""The handler with fake AWS clients: the wiring, not the maths."""

import json
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

    def __init__(self, mode="on", tuning=None):
        self.p = {"/m": mode, "/c": "2", "/s": "{}"}
        if tuning is not None:
            self.p["/t"] = tuning

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
    """GetMetricData with the timestamp shape CloudWatch really returns
    (prod 15.11, StartTime 20:48:12.3 -> 24 points 20:48:00 ... 19:48:00):
    StartTime is rounded down to the whole minute (API docs, StartTime),
    each point is stamped at StartTime + k * Period, and only periods that
    end by EndTime come back."""

    def __init__(self, gb_per_hour):
        self.b = gb_per_hour * 1e9
        self.calls = []

    def get_metric_data(self, MetricDataQueries, StartTime, EndTime, **_):
        self.calls.append((StartTime, EndTime))
        start = StartTime.replace(second=0, microsecond=0)
        out = []
        for q in MetricDataQueries:
            period = timedelta(seconds=q["MetricStat"]["Period"])
            ts = []
            while start + period * (len(ts) + 1) <= EndTime:
                ts.append(start + period * len(ts))
            val = self.b * (period.total_seconds() / 3600)
            out.append({"Id": q["Id"], "Timestamps": ts, "Values": [val] * len(ts)})
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


class CompletePeriods(unittest.TestCase):
    """Prod 15.11 (row 19): admin tuning up_gb_per_day 0, up_hours 1, NAT at
    18-27 MB every hour, yet the 20:48Z run said "nothing to change". The
    window started at now - 24 h (20:48:12.3), CloudWatch stamped points at
    the rounded 20:48:00, so each one landed a bucket early and the newest
    hour was always 0."""

    NOW = datetime(2026, 11, 15, 20, 48, 12, 345678, tzinfo=timezone.utc)
    PROD_TUNING = '{"up_gb_per_day":0,"up_hours":1,"cooldown_h":0}'

    def setUp(self):
        h._clients.clear()

    def clients(self, gb, tuning=None):
        h._clients.update(
            ssm=Ssm("on", tuning), ec2=Ec2(), cloudwatch=Cw(gb), sns=Sns()
        )
        return h._clients

    def test_newest_hour_is_counted(self):
        self.clients(0.025)
        facts, _ = h.collect(ENV, self.NOW)
        self.assertEqual(len(facts.hourly_nat_gb), 24)
        self.assertGreater(facts.hourly_nat_gb[-1], 0)
        self.assertTrue(all(x > 0 for x in facts.hourly_nat_gb))
        self.assertEqual(len(facts.daily_total_gb), 8)
        self.assertTrue(all(x > 0 for x in facts.daily_total_gb))

    def test_prod_tuning_zero_creates_the_endpoints(self):
        c = self.clients(0.025, self.PROD_TUNING)
        out = h.lambda_handler({}, None, env={**ENV, "TUNING_PARAM": "/t"}, now=self.NOW)
        self.assertEqual(out["decision"]["action"], "create")
        self.assertEqual(
            c["ec2"].created,
            ["com.amazonaws.us-east-1.ecr.api", "com.amazonaws.us-east-1.logs"],
        )

    def test_window_is_whole_periods(self):
        c = self.clients(0.025)
        h.collect(ENV, self.NOW)
        hour, day = c["cloudwatch"].calls[0], c["cloudwatch"].calls[1]
        end_h = datetime(2026, 11, 15, 20, tzinfo=timezone.utc)
        end_d = datetime(2026, 11, 15, tzinfo=timezone.utc)
        self.assertEqual(hour, (end_h - timedelta(hours=24), end_h))
        self.assertEqual(day, (end_d - timedelta(days=8), end_d))

    def test_defaults_still_ignore_low_traffic(self):
        c = self.clients(0.025)
        out = h.lambda_handler({}, None, env=ENV, now=self.NOW)
        self.assertEqual((out["decision"]["action"], c["ec2"].created), ("none", []))

    def test_log_line_carries_the_facts(self):
        self.clients(0.025, self.PROD_TUNING)
        out = h.lambda_handler({}, None, env={**ENV, "TUNING_PARAM": "/t"}, now=self.NOW)
        f = out["facts"]
        self.assertEqual(f["hour_window_end"], "2026-11-15T20:00:00+00:00")
        self.assertEqual((len(f["hourly_nat_gb"]), f["hourly_nat_gb"][-1]), (24, 0.05))  # Out + In metrics
        self.assertEqual((f["ceiling"], f["control"]), (2, "auto"))
        self.assertEqual(out["tuning"]["up_gb_per_day"], 0)
        json.dumps(out)


if __name__ == "__main__":
    unittest.main()


class AdminTuningTests(unittest.TestCase):
    """14.11 (owner): the endpoint thresholds from the admin (SSM
    `<prefix>/tuning`, read on every run over the Terraform TUNING)."""

    def test_schema_matches_the_config(self):
        import dataclasses
        import decision as dd
        defaults = {f.name: f.default for f in dataclasses.fields(dd.Config)}
        for k, s in h.tuning_schema().items():
            self.assertIn(k, defaults)
            self.assertTrue(s["min"] <= defaults[k] <= s["max"], k)

    def test_valid_values_apply_bad_ones_are_skipped(self):
        import decision as dd
        cfg, skipped = h.apply_admin_tuning(dd.Config(), json.dumps({"up_gb_per_day": 50, "down_days": 0, "x": 1}))
        self.assertEqual(cfg.up_gb_per_day, 50)
        self.assertEqual(cfg.down_days, dd.Config().down_days)
        self.assertEqual(sorted(skipped), ["down_days", "x"])

    def test_handler_reads_the_parameter(self):
        import decision as dd
        calls = []

        class Ssm:
            def get_parameter(self, Name):
                calls.append(Name)
                return {"Parameter": {"Value": '{"cooldown_h": 2}'}}

        h._clients["ssm"] = Ssm()
        cfg = h.read_admin_tuning(dd.Config(), {"TUNING_PARAM": "/x/endpoints-autoscale/tuning"})
        self.assertEqual((cfg.cooldown_h, calls), (2, ["/x/endpoints-autoscale/tuning"]))
