"""python3 -m unittest discover -s loadtest/scripts/tests"""
import importlib.util
import os
import unittest

spec = importlib.util.spec_from_file_location("cost_guard", os.path.join(os.path.dirname(__file__), "..", "cost-guard.py"))
cg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cg)


class Burn(unittest.TestCase):
    def test_empty_stack_costs_only_keys_and_secrets(self):
        self.assertLess(cg.burn_per_hour({}), 0.05)

    def test_m10_like_stack_matches_the_estimate_per_hour(self):
        inv = {"fargate": [{"count": 30, "vcpu": 0.5, "gb": 1}], "rds": ["db.r7g.2xlarge"],
               "redis": [{"type": "cache.r7g.xlarge", "nodes": 2}], "alb": 1, "nat": 1, "endpoints": 4, "ipv4": 10,
               "ec2": [{"type": "c7g.xlarge", "spot": True}] * 5}
        # estimate-cost m10: API 30 x 0.0247 = 0.74, db 1.104, redis 0.874, gens 0.29, alb .02, nat .045 ...
        b = cg.burn_per_hour(inv)
        self.assertGreater(b, 3.0)
        self.assertLess(b, 4.0)

    def test_unknown_database_class_is_not_free(self):
        self.assertGreater(cg.burn_per_hour({"rds": ["db.x99.huge"]}), 2.0)

    def test_spot_is_cheaper_than_on_demand(self):
        spot = cg.burn_per_hour({"ec2": [{"type": "c7g.xlarge", "spot": True}]})
        full = cg.burn_per_hour({"ec2": [{"type": "c7g.xlarge", "spot": False}]})
        self.assertLess(spot, full)

    def test_big_databases_priced_for_the_cloud_ladder(self):
        self.assertAlmostEqual(cg.PRICES["rds"]["db.r7g.8xlarge"], 4.416)


    def test_other_services_are_not_free(self):
        self.assertGreater(cg.burn_per_hour({"other": 1}), 2.0)


if __name__ == "__main__":
    unittest.main()
