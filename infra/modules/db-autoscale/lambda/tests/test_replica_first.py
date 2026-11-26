"""Item 28 (AU4, owner 25.11): read copy first, primary size second. Run:
    python3 -m unittest discover -s infra/modules/db-autoscale/lambda/tests
"""

import io
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import decision as d  # noqa: E402
import handler as h  # noqa: E402
import test_handler as th  # noqa: E402

NOW, Fake = th.NOW, th.Fake

UP = d.Decision("up", "load", "db.t4g.small", {"triggers": {"cpu": 85.0}})
ON = d.ReplicaFirst(mode="on", wait_min=60, max_replicas=5, possible=True)


def inst(copies=0):
    return d.Instance(cls="db.t4g.micro", replica_ids=tuple(f"db-replica-{i}" for i in range(copies)))


class DecisionTests(unittest.TestCase):
    def test_cpu_only_up_waits_for_a_copy(self):
        dec, st = d.replica_first(UP, ON, inst(), d.State(), NOW)
        self.assertEqual((dec.action, dec.reason), ("none", "replica_first"))
        self.assertEqual(st.read_out_since, NOW)

    def test_after_the_wait_the_primary_grows(self):
        st = d.State(read_out_since=NOW - 61 * 60)
        dec, st2 = d.replica_first(UP, ON, inst(1), st, NOW)
        self.assertEqual((dec.action, dec.target), ("up", "db.t4g.small"))
        self.assertIsNone(st2.read_out_since)

    def test_still_inside_the_wait_keeps_the_first_time(self):
        st = d.State(read_out_since=NOW - 30 * 60)
        dec, st2 = d.replica_first(UP, ON, inst(1), st, NOW)
        self.assertEqual(dec.reason, "replica_first")
        self.assertEqual(st2.read_out_since, NOW - 30 * 60)

    def test_at_the_copy_ceiling_the_primary_grows_at_once(self):
        dec, _ = d.replica_first(UP, replace_rf(max_replicas=2), inst(2), d.State(), NOW)
        self.assertEqual(dec.action, "up")

    def test_memory_connections_and_fast_lane_never_wait(self):
        for trig in ({"memory": 5.0}, {"connections": 95.0}, {"cpu_fast": 95.0}, {"cpu": 80.0, "memory": 5.0}):
            up = d.Decision("up", "load", "db.t4g.small", {"triggers": trig})
            dec, _ = d.replica_first(up, ON, inst(), d.State(), NOW)
            self.assertEqual(dec.action, "up", trig)

    def test_off_never_waits(self):
        dec, _ = d.replica_first(UP, replace_rf(mode="off"), inst(), d.State(), NOW)
        self.assertEqual(dec.action, "up")

    def test_auto_waits_only_when_a_copy_can_come(self):
        dec, _ = d.replica_first(UP, replace_rf(mode="auto", possible=False), inst(), d.State(), NOW)
        self.assertEqual(dec.action, "up")
        dec, _ = d.replica_first(UP, replace_rf(mode="auto", possible=True), inst(), d.State(), NOW)
        self.assertEqual(dec.reason, "replica_first")

    def test_calm_clears_the_wait(self):
        calm = d.Decision("none", "calm")
        dec, st = d.replica_first(calm, ON, inst(), d.State(read_out_since=NOW - 600), NOW)
        self.assertEqual(dec.reason, "calm")
        self.assertIsNone(st.read_out_since)


def replace_rf(**kw):
    from dataclasses import replace

    return replace(ON, **kw)


class Body:
    def __init__(self, data):
        self._b = io.BytesIO(data)

    def read(self):
        return self._b.read()


class S3Fake(Fake):
    def __init__(self, controls, **kw):
        super().__init__(**kw)
        self.controls = controls

    def get_object(self, Bucket, Key):
        if self.controls is None:
            raise RuntimeError("NoSuchKey")
        return {"Body": Body(json.dumps(self.controls).encode())}


class HandlerReplicaFirstTests(unittest.TestCase):
    def setUp(self):
        th.HandlerTests.setUp(self)
        os.environ.update(CONTROLS_BUCKET="docs", CONTROLS_KEY="ops/scale-controls.json")
        self.addCleanup(os.environ.pop, "CONTROLS_BUCKET", None)
        self.addCleanup(os.environ.pop, "CONTROLS_KEY", None)

    def run_with(self, fake, event=None):
        h._clients.clear()
        for n in ("rds", "cloudwatch", "ecs", "sns", "ssm", "s3"):
            h._clients[n] = fake
        return h.handler(event or {"mode": "tick"}, None, now=NOW)

    def test_on_holds_the_resize_and_tells_the_owner(self):
        f = S3Fake({"db_replica_first": {"mode": "on", "wait_minutes": 60, "max_replicas": 5, "possible": True}})
        self.assertEqual(self.run_with(f)["result"], "replica_first")
        self.assertEqual([c for c in f.calls if c[0] == "modify"], [])
        msg = [c[1]["Message"] for c in f.calls if c[0] == "publish"]
        self.assertTrue(msg and "копией базы" in msg[0])
        self.assertEqual(json.loads(f.param["/x/state"])["read_out_since"], NOW)

    def test_after_the_wait_the_handler_resizes(self):
        f = S3Fake({"db_replica_first": {"mode": "on", "wait_minutes": 60, "max_replicas": 5, "possible": True}})
        f.param["/x/state"] = json.dumps({"cls": "db.t4g.micro", "read_out_since": NOW - 3601})
        self.assertEqual(self.run_with(f)["to"], "db.t4g.small")

    def test_unreadable_controls_resize_as_before(self):
        f = S3Fake(None)
        self.assertEqual(self.run_with(f)["to"], "db.t4g.small")

    def test_no_bucket_resizes_as_before(self):
        os.environ.pop("CONTROLS_BUCKET")
        f = S3Fake({"db_replica_first": {"mode": "on", "possible": True}})
        self.assertEqual(self.run_with(f)["to"], "db.t4g.small")

    def test_junk_values_fall_back(self):
        os.environ["CONTROLS_BUCKET"] = "docs"
        f = S3Fake({"db_replica_first": {"mode": "maybe", "wait_minutes": "x", "possible": "yes"}})
        h._clients["s3"] = f
        rf = h.read_replica_first(os.environ)
        self.assertEqual((rf.mode, rf.wait_min, rf.max_replicas, rf.possible), ("off", 60, 5, False))
        self.assertEqual(self.run_with(f)["to"], "db.t4g.small")


if __name__ == "__main__":
    unittest.main()
