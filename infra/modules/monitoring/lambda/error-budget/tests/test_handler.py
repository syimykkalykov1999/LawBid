"""Б1: the 28-day error budget left, with a fake CloudWatch.
python3 -m unittest discover -s infra/modules/monitoring/lambda/error-budget/tests
"""

import json
import os
import sys
import unittest
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import handler as h  # noqa: E402

NS = "LawBid/lawbid-test"
SLOS = {
    # good / (good + bad), like slo.tf `call`
    "call": {"target": 0.95, "good": [{"ns": NS, "name": "SloCallConnected"}], "bad": [{"ns": NS, "name": "SloCallFailed"}]},
    # good / total, like slo.tf `otp`
    "otp": {"target": 0.95, "good": [{"ns": NS, "name": "SloOtpVerified"}], "total": [{"ns": NS, "name": "SloOtpSent"}]},
    # bad / total over two target groups, like observability.tf availability
    "availability": {
        "target": 0.999,
        "bad": [
            {"ns": "AWS/ApplicationELB", "name": "HTTPCode_Target_5XX_Count", "dims": {"TargetGroup": "tg/b", "LoadBalancer": "lb"}},
            {"ns": "AWS/ApplicationELB", "name": "HTTPCode_Target_5XX_Count", "dims": {"TargetGroup": "tg/g", "LoadBalancer": "lb"}},
        ],
        "total": [
            {"ns": "AWS/ApplicationELB", "name": "RequestCount", "dims": {"TargetGroup": "tg/b", "LoadBalancer": "lb"}},
            {"ns": "AWS/ApplicationELB", "name": "RequestCount", "dims": {"TargetGroup": "tg/g", "LoadBalancer": "lb"}},
        ],
    },
}


class Cw:
    """Values per (metric name, target group); results come in two pages."""

    def __init__(self, values):
        self.values, self.calls, self.put = values, [], []

    def get_metric_data(self, MetricDataQueries, StartTime, EndTime, NextToken=None):
        self.calls.append((StartTime, EndTime, NextToken, len(MetricDataQueries)))
        out = []
        for q in MetricDataQueries:
            m = q["MetricStat"]["Metric"]
            tg = next((d["Value"] for d in m["Dimensions"] if d["Name"] == "TargetGroup"), None)
            total = self.values.get((m["MetricName"], tg), 0)
            half = total / 2
            out.append({"Id": q["Id"], "Values": [half] if NextToken is None else [total - half]})
        return {"MetricDataResults": out, **({} if NextToken else {"NextToken": "p2"})}

    def put_metric_data(self, Namespace, MetricData):
        self.put.append((Namespace, MetricData))


NOW = datetime(2026, 11, 25, 16, 42, 7, tzinfo=timezone.utc)


class Budget(unittest.TestCase):
    def test_formula_on_good_and_bad(self):
        # 1000 calls, 25 failed at a 95 % target: half of the 5 % budget used.
        left, total, bad = h.remaining_budget(SLOS["call"], {"good": 975, "bad": 25}, 100)
        self.assertAlmostEqual(left, 0.5)
        self.assertEqual((total, bad), (1000, 25))

    def test_good_over_total(self):
        # 1000 codes sent, 900 verified: 10 % bad against a 5 % budget = spent twice.
        left, _, bad = h.remaining_budget(SLOS["otp"], {"good": 900, "total": 1000}, 100)
        self.assertAlmostEqual(left, -1.0)
        self.assertEqual(bad, 100)

    def test_quiet_window_is_full_budget(self):
        left, _, _ = h.remaining_budget(SLOS["call"], {"good": 10, "bad": 30}, 100)
        self.assertEqual(left, 1.0)

    def test_measure_sums_pages_and_target_groups_over_28_days(self):
        cw = Cw({
            ("SloCallConnected", None): 990, ("SloCallFailed", None): 10,
            ("SloOtpVerified", None): 95, ("SloOtpSent", None): 99,  # under MIN_EVENTS
            ("HTTPCode_Target_5XX_Count", "tg/b"): 600, ("HTTPCode_Target_5XX_Count", "tg/g"): 600,
            ("RequestCount", "tg/b"): 600_000, ("RequestCount", "tg/g"): 600_000,
        })
        r = h.measure(cw, SLOS, 28, 100, now=NOW)
        self.assertAlmostEqual(r["call"]["remaining"], 0.8)  # 1 % of 5 %
        self.assertEqual(r["otp"]["remaining"], 1.0)
        self.assertAlmostEqual(r["availability"]["remaining"], 0.0)  # 0.1 % of 0.1 %: spent
        start, end, _, n = cw.calls[0]
        self.assertEqual(end, datetime(2026, 11, 25, 16, 0, tzinfo=timezone.utc))
        self.assertEqual((end - start).days, 28)
        self.assertEqual(n, 8)
        self.assertEqual(len(cw.calls), 2)  # followed NextToken

    def test_handler_publishes_one_metric_per_slo(self):
        os.environ.update({"SLOS": json.dumps(SLOS), "NAMESPACE": NS, "WINDOW_DAYS": "28", "MIN_EVENTS": "100"})
        cw = Cw({("SloCallConnected", None): 900, ("SloCallFailed", None): 100})
        h.lambda_handler({}, None, cw=cw)
        ns, data = cw.put[0]
        self.assertEqual(ns, NS)
        got = {d["Dimensions"][0]["Value"]: d["Value"] for d in data}
        self.assertEqual(set(got), {"availability", "call", "otp"})
        self.assertAlmostEqual(got["call"], -1.0)  # 10 % bad vs 5 %
        self.assertTrue(all(d["MetricName"] == "SloBudgetRemaining" for d in data))


if __name__ == "__main__":
    unittest.main()
