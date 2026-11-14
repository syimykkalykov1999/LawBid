"""python3 -m unittest discover -s loadtest/scripts/tests"""
import importlib.util
import os
import unittest

spec = importlib.util.spec_from_file_location("combat_watch", os.path.join(os.path.dirname(__file__), "..", "combat-watch.py"))
cw = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cw)

SPOT = [{"provider": "FARGATE", "base": 1, "weight": 1}, {"provider": "FARGATE_SPOT", "base": 0, "weight": 4}]
REGULAR = [{"provider": "FARGATE", "base": 1, "weight": 1}]


def line(t, api, strategy=SPOT, db="db.t4g.medium", redis="cache.t4g.small", ratio=0.0, on_spot=0):
    return {"t": t, "ecs": {"api": {"desired": api, "running": api, "pending": 0, "strategy": strategy, "on_spot": on_spot}},
            "database": {"class": db, "status": "available"}, "redis": {"class": redis, "status": "available"},
            "alb": {"ratio_5xx": ratio}}


class Ratio(unittest.TestCase):
    def test_too_few_requests_is_not_judged(self):
        self.assertIsNone(cw.ratio_5xx(100, 50, 0, 500))

    def test_counts_target_and_balancer_5xx(self):
        self.assertAlmostEqual(cw.ratio_5xx(1000, 6, 6, 500), 0.012)


class DataTier(unittest.TestCase):
    def test_healthy(self):
        self.assertIsNone(cw.data_tier_breach({"status": "available"}, {"status": "available"}))

    def test_resize_is_not_a_destroy(self):
        self.assertIsNone(cw.data_tier_breach({"status": "modifying"}, {"status": "modifying"}))

    def test_deleting_or_gone_is_a_stop(self):
        self.assertIn("deleting", cw.data_tier_breach({"status": "deleting"}, {"status": "available"}))
        self.assertEqual(cw.data_tier_breach(None, {"status": "available"}), "database is gone")
        self.assertIn("redis", cw.data_tier_breach({"status": "available"}, {"status": "deleting"}))


class Summary(unittest.TestCase):
    def test_up_and_back_down_with_spot_fallback_and_restore(self):
        lines = [line("10:00", 1), line("10:10", 4, on_spot=3), line("10:20", 9, REGULAR, redis="cache.t4g.medium"),
                 line("10:30", 9, SPOT, db="db.t4g.large", on_spot=7), line("10:50", 1, SPOT, db="db.t4g.large")]
        s = cw.summarize(lines)
        api = s["services"]["api"]
        self.assertTrue(api["scaled_out"])
        self.assertTrue(api["back_to_start"])
        self.assertEqual(api["peak"], 9)
        self.assertEqual(api["back_at"], "10:50")
        self.assertEqual(api["strategy_changes"], ["spot", "regular", "spot"])
        self.assertTrue(api["fallback_seen"])
        self.assertEqual(api["max_tasks_on_spot"], 7)
        self.assertEqual(s["database"]["classes"], ["db.t4g.medium", "db.t4g.large"])
        self.assertFalse(s["database"]["back_to_start"])  # the database shrinks only at night (owner 12.11)
        self.assertEqual(s["redis"]["classes"], ["cache.t4g.small", "cache.t4g.medium", "cache.t4g.small"])
        self.assertTrue(s["redis"]["back_to_start"])
        self.assertIn("ECS api tasks", cw.render(s))

    def test_never_scaled(self):
        s = cw.summarize([line("10:00", 1), line("10:10", 1)])
        self.assertFalse(s["services"]["api"]["scaled_out"])
        self.assertIsNone(s["services"]["api"]["back_at"])

    def test_empty(self):
        self.assertEqual(cw.summarize([])["samples"], 0)


if __name__ == "__main__":
    unittest.main()
