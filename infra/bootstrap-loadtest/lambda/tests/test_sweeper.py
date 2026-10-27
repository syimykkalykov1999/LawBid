import os
import sys
import unittest
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import sweeper as s  # noqa: E402

NOW = datetime(2026, 10, 25, 12, tzinfo=timezone.utc)


def ago(h):
    return (NOW - timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M:%SZ")


T = lambda at, project="lawbid-loadtest": {"Project": project, "CreatedAt": at}  # noqa: E731
R = {
    "ec2": "arn:aws:ec2:us-east-1:1:instance/i-1",
    "nat": "arn:aws:ec2:us-east-1:1:natgateway/nat-1",
    "eip": "arn:aws:ec2:us-east-1:1:elastic-ip/eipalloc-1",
    "rds": "arn:aws:rds:us-east-1:1:db:lawbid-loadtest-db",
    "ecs": "arn:aws:ecs:us-east-1:1:service/lt/api",
    "cache": "arn:aws:elasticache:us-east-1:1:replicationgroup:lt-redis",
    "vpc": "arn:aws:ec2:us-east-1:1:vpc/vpc-1",
}


class Sweeper(unittest.TestCase):
    def test_only_old_costly_resources_in_a_safe_order(self):
        res = [(a, T(ago(5))) for a in R.values()]
        out = s.plan(res, NOW, 4)
        self.assertEqual([k for k, _, _ in out], ["ec2", "ecs", "rds", "cache", "nat", "eip"])

    def test_young_missing_and_foreign_are_left_alone(self):
        res = [
            (R["ec2"], T(ago(1))),
            (R["rds"], {"Project": "lawbid-loadtest"}),
            (R["nat"], T(ago(9), project="lawbid")),
        ]
        self.assertEqual(s.plan(res, NOW, 4), [])

    def test_epoch_marker_is_old(self):
        self.assertTrue(s.old_enough("1970-01-01T00:00:00Z", NOW, 4))


if __name__ == "__main__":
    unittest.main()
