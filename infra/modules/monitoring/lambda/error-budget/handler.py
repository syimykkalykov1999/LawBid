"""Б1 (25.11): the error budget left over the last 28 days, per SLO.

Google SRE Workbook, ch. 2 "Implementing SLOs" and its appendix "Example
Error Budget Policy": the budget is 1 - SLO, measured over a rolling
four-week window. CloudWatch cannot alarm on 28 days directly (PutMetricAlarm:
Period x EvaluationPeriods <= 604 800 s) and AWS Application Signals SLOs have
no Terraform resource in the AWS provider 6.72, so this function sums the
same metrics the burn-rate alarms read (slo.tf, observability.tf) once an
hour and writes one number per SLO:

    remaining = 1 - (bad / total) / (1 - target)

1 = the whole budget is left, 0 = spent, below 0 = overspent. A window with
fewer than MIN_EVENTS events counts as 1 (a quiet month is not an outage).
The alarms `<env>-slo-<flow>-budget-exhausted` watch it (<= 0) and
scripts/deploy/budget-gate.sh reads those alarms before a release.
"""

import json
import os
from datetime import datetime, timedelta, timezone

PERIOD = 3600  # one-hour sums: the 28-day window moves by the hour


def _queries(slos):
    """One GetMetricData query per metric, ids m0, m1, ...; returns (queries, index)."""
    queries, index = [], {}
    for name, slo in sorted(slos.items()):
        for part in ("good", "bad", "total"):
            for metric in slo.get(part) or []:
                qid = f"m{len(queries)}"
                index[qid] = (name, part)
                queries.append(
                    {
                        "Id": qid,
                        "MetricStat": {
                            "Metric": {
                                "Namespace": metric["ns"],
                                "MetricName": metric["name"],
                                "Dimensions": [
                                    {"Name": k, "Value": v}
                                    for k, v in sorted((metric.get("dims") or {}).items())
                                ],
                            },
                            "Period": PERIOD,
                            "Stat": "Sum",
                        },
                        "ReturnData": True,
                    }
                )
    return queries, index


def remaining_budget(slo, sums, min_events):
    """The Workbook formula on the summed counts of one SLO."""
    good = sums.get("good", 0.0)
    bad = sums.get("bad", 0.0)
    if slo.get("total"):
        total = sums.get("total", 0.0)
        if not slo.get("bad"):
            bad = max(0.0, total - good)
    else:
        total = good + bad
    if total < min_events or total <= 0:
        return 1.0, total, bad
    allowed = 1.0 - float(slo["target"])
    if allowed <= 0:
        return (1.0 if bad == 0 else -1.0), total, bad
    return 1.0 - (bad / total) / allowed, total, bad


def measure(cw, slos, window_days, min_events, now=None):
    now = now or datetime.now(timezone.utc)
    end = now.replace(minute=0, second=0, microsecond=0)
    start = end - timedelta(days=window_days)
    queries, index = _queries(slos)
    sums = {name: {} for name in slos}
    for i in range(0, len(queries), 500):  # GetMetricData takes up to 500 queries
        token = None
        while True:
            kw = {"MetricDataQueries": queries[i : i + 500], "StartTime": start, "EndTime": end}
            if token:
                kw["NextToken"] = token
            res = cw.get_metric_data(**kw)
            for r in res.get("MetricDataResults", []):
                name, part = index[r["Id"]]
                sums[name][part] = sums[name].get(part, 0.0) + float(sum(r.get("Values") or []))
            token = res.get("NextToken")
            if not token:
                break
    out = {}
    for name, slo in slos.items():
        left, total, bad = remaining_budget(slo, sums[name], min_events)
        out[name] = {"remaining": round(left, 6), "total": total, "bad": bad}
    return out


def publish(cw, namespace, result, now=None):
    now = now or datetime.now(timezone.utc)
    data = [
        {
            "MetricName": "SloBudgetRemaining",
            "Dimensions": [{"Name": "Slo", "Value": name}],
            "Timestamp": now,
            "Value": r["remaining"],
            "Unit": "None",
        }
        for name, r in sorted(result.items())
    ]
    for i in range(0, len(data), 1000):
        cw.put_metric_data(Namespace=namespace, MetricData=data[i : i + 1000])


def lambda_handler(event, context, cw=None):
    if cw is None:
        import boto3  # in the Lambda runtime

        cw = boto3.client("cloudwatch")
    slos = json.loads(os.environ["SLOS"])
    result = measure(
        cw,
        slos,
        int(os.environ.get("WINDOW_DAYS", "28")),
        float(os.environ.get("MIN_EVENTS", "100")),
    )
    publish(cw, os.environ["NAMESPACE"], result)
    print(json.dumps({"metric": "error_budget", "window_days": int(os.environ.get("WINDOW_DAYS", "28")), "slos": result}))
    return result
