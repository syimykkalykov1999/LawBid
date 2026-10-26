"""Decision logic of the Redis autoscaler. Run:
    python3 -m unittest discover -s infra/modules/redis-autoscale/lambda/tests
(no third-party packages; pytest runs these too)."""

import os
import sys
import unittest
from dataclasses import replace

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import decision as d  # noqa: E402

H = 3600
NOW = 1_800_000_000.0


def spec(name, vcpu, mem, price, base=None, speed=1.0):
    return d.ClassSpec(name, vcpu, mem, 65000, price, base, speed)


LADDER = (
    spec("cache.t4g.micro", 2, 0.5, 23.36, 10),
    spec("cache.t4g.small", 2, 1.37, 46.72, 20),
    spec("cache.t4g.medium", 2, 3.09, 94.9, 20),
    spec("cache.r7g.large", 2, 13.07, 319.74, None, 1.3),
    spec("cache.r7g.xlarge", 4, 26.32, 637.98, None, 1.3),
    spec("cache.r7g.2xlarge", 8, 52.82, 1274.58, None, 1.3),
)
CFG = d.Config(ladder=LADDER, min_class="cache.t4g.micro", max_class="cache.r7g.xlarge")
WINDOW = CFG.down_window_h * H // CFG.period_s  # 864 points


def inst(cls="cache.t4g.small", **kw):
    return d.Instance(cls=cls, **kw)


def calm(n=4):
    return d.Metrics(cpu=(10.0,) * n, mem_pct=(30.0,) * n, conns=(100.0,) * n, credit=(500.0,) * n)


def quiet(cpu=5.0, mem=10.0, n=WINDOW):
    return d.Metrics(cpu=(cpu,) * n, mem_pct=(mem,) * n, conns=(50.0,) * n)


OLD = d.State(cls="cache.t4g.medium", last_change=NOW - 10 * 24 * H)


class UpTests(unittest.TestCase):
    def go(self, m, cls="cache.t4g.small", state=None, guards=None, **kw):
        return d.decide(CFG, "tick", inst(cls, **kw), guards or d.Guards(), state or d.State(cls=cls), m, NOW)

    def test_calm(self):
        r = self.go(calm())
        self.assertEqual((r.action, r.reason), ("none", "calm"))

    def test_cpu_over_70_for_15_min_goes_one_step_up(self):
        r = self.go(replace(calm(), cpu=(20.0, 78.0, 80.0, 75.0)))
        self.assertEqual((r.action, r.target), ("up", "cache.t4g.medium"))
        self.assertEqual(r.facts["triggers"]["cpu"], 77.7)

    def test_cpu_spike_of_10_min_is_ignored(self):
        self.assertEqual(self.go(replace(calm(), cpu=(20.0, 20.0, 90.0, 95.0))).action, "none")

    def test_memory_over_75_for_15_min(self):
        r = self.go(replace(calm(), mem_pct=(10.0, 80.0, 78.0, 76.0)))
        self.assertEqual((r.action, r.target), ("up", "cache.t4g.medium"))
        self.assertEqual(r.facts["triggers"]["memory"], 80.0)

    def test_memory_exactly_at_limit_is_not_a_trigger(self):
        self.assertEqual(self.go(replace(calm(), mem_pct=(75.0,) * 4)).action, "none")

    def test_one_point_nearly_full_memory_acts_at_once(self):
        r = self.go(replace(calm(), mem_pct=(30.0, 30.0, 30.0, 95.0)))
        self.assertEqual(r.action, "up")

    def test_connections_alone_never_resize(self):
        m = replace(calm(), conns=(60000.0,) * 4)
        r = self.go(m)
        self.assertEqual((r.action, r.reason), ("none", "connections_high"))
        self.assertEqual(r.facts["triggers"]["connections"], 92.3)

    def test_connections_with_cpu_resize(self):
        m = replace(calm(), conns=(60000.0,) * 4, cpu=(80.0,) * 4)
        r = self.go(m)
        self.assertEqual(r.action, "up")
        self.assertIn("connections", r.facts["triggers"])

    def test_burstable_credits_near_zero(self):
        r = self.go(replace(calm(), credit=(5.0, 4.0, 3.0, 2.0)))
        self.assertEqual((r.action, r.target), ("up", "cache.t4g.medium"))
        self.assertEqual(r.facts["triggers"]["credits"], 2.0)

    def test_credits_ignored_on_non_burstable(self):
        r = self.go(replace(calm(), credit=(1.0,) * 4), cls="cache.r7g.large")
        self.assertEqual(r.reason, "calm")

    def test_ladder_crosses_from_t4g_medium_to_r7g_large(self):
        r = self.go(replace(calm(), cpu=(90.0,) * 4), cls="cache.t4g.medium")
        self.assertEqual(r.target, "cache.r7g.large")

    def test_ceiling_stops_and_reports(self):
        r = self.go(replace(calm(), cpu=(90.0,) * 4), cls="cache.r7g.xlarge")
        self.assertEqual((r.action, r.reason), ("none", "at_max"))

    def test_cooldown_after_any_change(self):
        st = d.State(cls="cache.t4g.small", last_change=NOW - 10 * 60)
        r = self.go(replace(calm(), cpu=(90.0,) * 4), state=st)
        self.assertEqual(r.reason, "cooldown_up")

    def test_cooldown_over(self):
        st = d.State(cls="cache.t4g.small", last_up=NOW - 31 * 60, last_change=NOW - 31 * 60)
        self.assertEqual(self.go(replace(calm(), cpu=(90.0,) * 4), state=st).action, "up")

    def test_not_enough_points_no_trigger(self):
        self.assertEqual(self.go(replace(calm(), cpu=(90.0, 90.0))).action, "none")

    def test_unknown_class(self):
        r = self.go(calm(), cls="cache.m5.large")
        self.assertEqual(r.reason, "unknown_class")


class GuardTests(unittest.TestCase):
    def go(self, i, g=d.Guards()):
        return d.decide(CFG, "tick", i, g, d.State(cls=i.cls), replace(calm(), cpu=(90.0,) * 4), NOW)

    def test_each_guard_blocks(self):
        cases = [
            (inst(status="modifying"), d.Guards(), "not_available"),
            (inst(pending=True), d.Guards(), "pending_modification"),
            (inst(auto_failover=False), d.Guards(), "no_failover"),
            (inst(replicas=0), d.Guards(), "no_failover"),
            (inst(cluster_mode=True), d.Guards(), "cluster_mode"),
            (inst(), d.Guards(deploying=True), "deploying"),
            (inst(), d.Guards(oneoff_tasks=True), "oneoff_tasks"),
            (inst(), d.Guards(ecs_unknown=True), "ecs_unknown"),
        ]
        for i, g, why in cases:
            with self.subTest(why):
                r = self.go(i, g)
                self.assertEqual((r.action, r.reason), ("none", why))

    def test_failover_not_required_when_configured(self):
        cfg = replace(CFG, require_failover=False)
        r = d.decide(cfg, "tick", inst(replicas=0, auto_failover=False), d.Guards(),
                     d.State(cls="cache.t4g.small"), replace(calm(), cpu=(90.0,) * 4), NOW)
        self.assertEqual(r.action, "up")


class DownTests(unittest.TestCase):
    def go(self, m, cls="cache.t4g.medium", state=OLD, guards=None, cfg=CFG, **kw):
        return d.decide(cfg, "night", inst(cls, **kw), guards or d.Guards(), state, m, NOW)

    def test_quiet_three_days_goes_one_step_down(self):
        r = self.go(quiet())
        self.assertEqual((r.action, r.target), ("down", "cache.t4g.small"))
        self.assertEqual(r.facts["cpu_max"], 5.0)

    def test_not_at_night(self):
        self.assertEqual(self.go(quiet(), guards=d.Guards(night_ok=False)).reason, "not_night")

    def test_at_min(self):
        self.assertEqual(self.go(quiet(), cls="cache.t4g.micro").reason, "at_min")

    def test_min_class_above_bottom(self):
        cfg = replace(CFG, min_class="cache.t4g.medium")
        self.assertEqual(self.go(quiet(), cfg=cfg).reason, "at_min")

    def test_cooldown_after_recent_up(self):
        st = d.State(cls="cache.t4g.medium", last_up=NOW - 48 * H, last_change=NOW - 48 * H)
        self.assertEqual(self.go(quiet(), state=st).reason, "cooldown_down")

    def test_cooldown_ends_after_72h(self):
        st = d.State(cls="cache.t4g.medium", last_up=NOW - 73 * H, last_change=NOW - 73 * H)
        self.assertEqual(self.go(quiet(), state=st).action, "down")

    def test_one_busy_hour_blocks(self):
        m = quiet()
        cpu = list(m.cpu)
        cpu[100] = 35.0
        self.assertEqual(self.go(replace(m, cpu=tuple(cpu))).reason, "cpu_not_low")

    def test_memory_peak_blocks(self):
        m = quiet()
        mem = list(m.mem_pct)
        mem[10] = 45.0
        self.assertEqual(self.go(replace(m, mem_pct=tuple(mem))).reason, "memory_not_low")

    def test_busy_right_now_blocks(self):
        m = quiet()
        m = replace(m, cpu=m.cpu[:-3] + (80.0, 80.0, 80.0))
        self.assertEqual(self.go(m).reason, "busy_now")

    def test_missing_data_blocks(self):
        self.assertEqual(self.go(quiet(n=100)).reason, "not_enough_data")

    def test_smaller_size_needs_room_in_memory(self):
        # 30 % of 3.09 GiB = 0.93 GiB; on the 1.37 GiB node that is 68 % > 60 %
        self.assertEqual(self.go(quiet(mem=30.0)).reason, "target_memory_tight")

    def test_memory_room_ok(self):
        # 20 % of 3.09 = 0.62 GiB -> 45 % of 1.37 GiB
        self.assertEqual(self.go(quiet(mem=20.0)).action, "down")

    def test_burstable_target_cpu_tight(self):
        # small baseline 20: avg 17 > 0.8 * 20
        self.assertEqual(self.go(quiet(cpu=17.0)).reason, "target_burst_tight")

    def test_cross_family_uses_engine_speed(self):
        # r7g.large -> t4g.medium: the engine runs 1.3x slower, so the burst
        # baseline (20) is exceeded at 26 % but not at 10 %
        r = self.go(quiet(cpu=26.0, mem=5.0), cls="cache.r7g.large")
        self.assertEqual(r.reason, "target_burst_tight")  # 26 * 1.3 = 33.8 > 16
        r = self.go(quiet(cpu=14.0, mem=5.0), cls="cache.r7g.large")
        self.assertEqual(r.reason, "target_burst_tight")  # 14 * 1.3 = 18.2 > 16
        r = self.go(quiet(cpu=10.0, mem=5.0), cls="cache.r7g.large")
        self.assertEqual((r.action, r.target), ("down", "cache.t4g.medium"))

    def test_same_family_step_keeps_cpu(self):
        self.assertEqual(self.go(quiet(cpu=29.0, mem=5.0), cls="cache.r7g.xlarge").action, "down")

    def test_guards_apply_to_night_too(self):
        self.assertEqual(self.go(quiet(), status="modifying").reason, "not_available")
        self.assertEqual(self.go(quiet(), guards=d.Guards(deploying=True)).reason, "deploying")


class StateTests(unittest.TestCase):
    def test_first_run_records_class(self):
        s = d.reconcile_state(CFG, d.State(), "cache.t4g.small", NOW)
        self.assertEqual((s.cls, s.last_change), ("cache.t4g.small", None))

    def test_manual_up_is_noticed(self):
        s = d.reconcile_state(CFG, d.State(cls="cache.t4g.small"), "cache.t4g.medium", NOW)
        self.assertEqual((s.last_up, s.last_change), (NOW, NOW))

    def test_manual_down_is_noticed(self):
        s = d.reconcile_state(CFG, d.State(cls="cache.t4g.medium"), "cache.t4g.small", NOW)
        self.assertEqual(s.last_down, NOW)

    def test_same_class_unchanged(self):
        st = d.State(cls="cache.t4g.small")
        self.assertIs(d.reconcile_state(CFG, st, "cache.t4g.small", NOW), st)


class MessageTests(unittest.TestCase):
    def test_up_message(self):
        r = d.Decision("up", "load", "cache.t4g.medium", {"triggers": {"cpu": 77.7, "memory": 80.0}})
        t = d.message(CFG, r, "cache.t4g.small")
        self.assertIn("Redis увеличен: cache.t4g.small → cache.t4g.medium", t)
        self.assertIn("$95/мес", t)
        self.assertIn("пауза", t)

    def test_down_message_has_saving(self):
        r = d.Decision("down", "quiet", "cache.t4g.small", {"cpu_max": 5.0, "mem_max": 10.0})
        t = d.message(CFG, r, "cache.t4g.medium")
        self.assertIn("экономия ≈ $48/мес", t)

    def test_dry_run_prefix(self):
        r = d.Decision("down", "quiet", "cache.t4g.small", {"cpu_max": 5.0, "mem_max": 10.0})
        self.assertTrue(d.message(CFG, r, "cache.t4g.medium", dry_run=True).startswith("ПРОБНЫЙ РЕЖИМ"))

    def test_cap_message_mentions_cluster_mode(self):
        r = d.Decision("none", "at_max", facts={"triggers": {"cpu": 90.0}})
        self.assertIn("кластерный режим", d.cap_message(CFG, r, "cache.r7g.xlarge"))


if __name__ == "__main__":
    unittest.main()
