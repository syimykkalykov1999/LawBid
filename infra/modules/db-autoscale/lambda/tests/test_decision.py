"""Decision logic of the database autoscaler. Run:
    python3 -m unittest discover -s infra/modules/db-autoscale/lambda/tests
(no third-party packages; pytest runs these too)."""

import os
import sys
import unittest
from dataclasses import replace

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import decision as d  # noqa: E402

GIB = d.GIB
H = 3600
NOW = 1_800_000_000.0


def spec(name, vcpu, mem, price, base=None):
    return d.ClassSpec(name, vcpu, mem, min(5000, int(mem * GIB * 0.88 / 9531392)), price, base)


LADDER = (
    spec("db.t4g.micro", 2, 1, 23.36, 10),
    spec("db.t4g.small", 2, 2, 47.45, 20),
    spec("db.t4g.medium", 2, 4, 94.17, 20),
    spec("db.t4g.large", 2, 8, 188.34, 30),
    spec("db.r7g.large", 2, 16, 348.94),
    spec("db.r7g.xlarge", 4, 32, 697.88),
    spec("db.r7g.2xlarge", 8, 64, 1396.49),
)
CFG = d.Config(ladder=LADDER, min_class="db.t4g.micro", max_class="db.r7g.xlarge")
WINDOW = CFG.down_window_h * H // CFG.period_s  # 864 points


def inst(cls="db.t4g.small", **kw):
    return d.Instance(cls=cls, **kw)


def calm(cls="db.t4g.small", n=4):
    s = CFG.spec(cls)
    return d.Metrics(
        cpu=(10.0,) * n,
        mem_free=(s.memory_gib * GIB * 0.5,) * n,
        conns=(s.max_connections * 0.1,) * n,
        credit=(500.0,) * n,
    )


def quiet_week(cls="db.t4g.medium", cpu=5.0, conns_pct=10, free_pct=70, n=WINDOW):
    s = CFG.spec(cls)
    return d.Metrics(
        cpu=(cpu,) * n,
        mem_free=(s.memory_gib * GIB * free_pct / 100,) * n,
        conns=(s.max_connections * conns_pct / 100,) * n,
    )


OLD = d.State(cls="db.t4g.medium", last_change=NOW - 10 * 24 * H)


class UpTests(unittest.TestCase):
    def go(self, m, cls="db.t4g.small", state=None, guards=None, **kw):
        return d.decide(CFG, "tick", inst(cls, **kw), guards or d.Guards(), state or d.State(cls=cls), m, NOW)

    def test_calm_does_nothing(self):
        r = self.go(calm())
        self.assertEqual((r.action, r.reason), ("none", "calm"))

    def test_cpu_over_70_for_15_minutes_goes_up_one_step(self):
        m = replace(calm(), cpu=(20.0, 78.0, 80.0, 75.0))
        r = self.go(m)
        self.assertEqual((r.action, r.target), ("up", "db.t4g.medium"))
        self.assertEqual(r.facts["triggers"]["cpu"], 77.7)

    def test_cpu_spike_of_10_minutes_is_ignored(self):
        m = replace(calm(), cpu=(20.0, 20.0, 90.0, 95.0))
        self.assertEqual(self.go(m).action, "none")

    def test_low_memory_for_15_minutes(self):
        s = CFG.spec("db.t4g.small")
        m = replace(calm(), mem_free=(s.memory_gib * GIB * 0.05,) * 4)
        r = self.go(m)
        self.assertEqual(r.action, "up")
        self.assertIn("memory", r.facts["triggers"])

    def test_connections_over_80_percent_for_10_minutes(self):
        s = CFG.spec("db.t4g.small")
        m = replace(calm(), conns=(s.max_connections * 0.5, s.max_connections * 0.85, s.max_connections * 0.9))
        r = self.go(m)
        self.assertEqual(r.action, "up")
        self.assertIn("connections", r.facts["triggers"])

    def test_one_point_at_85_percent_is_not_enough(self):
        s = CFG.spec("db.t4g.small")
        m = replace(calm(), conns=(s.max_connections * 0.5, s.max_connections * 0.85))
        self.assertEqual(self.go(m).action, "none")

    def test_connections_nearly_full_acts_at_once(self):
        s = CFG.spec("db.t4g.small")
        m = replace(calm(), conns=(s.max_connections * 0.5, s.max_connections * 0.95))
        self.assertEqual(self.go(m).action, "up")

    def test_burst_credits_exhausted_on_t4g(self):
        m = replace(calm(), credit=(3.0, 1.0, 0.0, 0.0))
        r = self.go(m)
        self.assertEqual(r.action, "up")
        self.assertIn("credits", r.facts["triggers"])

    def test_credits_are_ignored_on_r7g(self):
        m = replace(calm("db.r7g.large"), credit=(0.0,) * 4)
        self.assertEqual(self.go(m, cls="db.r7g.large").action, "none")

    def test_missing_data_never_triggers(self):
        m = replace(calm(), cpu=(90.0, 90.0))  # only 10 minutes of data
        self.assertEqual(self.go(m).action, "none")

    def test_at_the_ceiling_it_does_not_go_higher(self):
        s = CFG.spec("db.r7g.xlarge")
        m = replace(calm("db.r7g.xlarge"), cpu=(95.0,) * 4)
        r = self.go(m, cls="db.r7g.xlarge")
        self.assertEqual((r.action, r.reason), ("none", "at_max"))
        self.assertIn("cpu", r.facts["triggers"])
        self.assertIsNotNone(s)

    def test_ceiling_can_be_raised(self):
        cfg = replace(CFG, max_class="db.r7g.2xlarge")
        m = replace(calm("db.r7g.xlarge"), cpu=(95.0,) * 4)
        r = d.decide(cfg, "tick", inst("db.r7g.xlarge"), d.Guards(), d.State(cls="db.r7g.xlarge"), m, NOW)
        self.assertEqual(r.target, "db.r7g.2xlarge")

    def test_cooldown_30_minutes_after_any_change(self):
        m = replace(calm(), cpu=(90.0,) * 4)
        st = d.State(cls="db.t4g.small", last_up=NOW - 20 * 60, last_change=NOW - 20 * 60)
        self.assertEqual(self.go(m, state=st).reason, "cooldown_up")
        st = d.State(cls="db.t4g.small", last_up=NOW - 31 * 60, last_change=NOW - 31 * 60)
        self.assertEqual(self.go(m, state=st).action, "up")

    def test_up_is_possible_soon_after_a_night_down(self):
        m = replace(calm(), cpu=(90.0,) * 4)
        st = d.State(cls="db.t4g.small", last_down=NOW - 2 * H, last_change=NOW - 2 * H)
        self.assertEqual(self.go(m, state=st).action, "up")


class GuardTests(unittest.TestCase):
    HOT = replace(calm(), cpu=(95.0,) * 4)

    def go(self, inst_kw=None, **g):
        return d.decide(CFG, "tick", inst(**(inst_kw or {})), d.Guards(**g), d.State(cls="db.t4g.small"), self.HOT, NOW)

    def test_each_guard_blocks(self):
        self.assertEqual(self.go({"status": "modifying"}).reason, "not_available")
        self.assertEqual(self.go({"status": "backing-up"}).reason, "not_available")
        self.assertEqual(self.go({"pending": True}).reason, "pending_modification")
        self.assertEqual(self.go({"has_replicas": True}).reason, "has_replicas")
        self.assertEqual(self.go({"multi_az": False}).reason, "not_multi_az")
        self.assertEqual(self.go(deploying=True).reason, "deploying")
        self.assertEqual(self.go(oneoff_tasks=True).reason, "oneoff_tasks")
        self.assertEqual(self.go(ecs_unknown=True).reason, "ecs_unknown")

    def test_single_az_allowed_when_configured(self):
        cfg = replace(CFG, require_multi_az=False)
        r = d.decide(cfg, "tick", inst(multi_az=False), d.Guards(), d.State(cls="db.t4g.small"), self.HOT, NOW)
        self.assertEqual(r.action, "up")

    def test_unknown_class_is_left_alone(self):
        r = d.decide(CFG, "tick", inst("db.t4g.xlarge"), d.Guards(), d.State(), self.HOT, NOW)
        self.assertEqual((r.action, r.reason), ("none", "unknown_class"))

    def test_bad_mode(self):
        r = d.decide(CFG, "x", inst(), d.Guards(), d.State(), self.HOT, NOW)
        self.assertEqual(r.action, "none")


class DownTests(unittest.TestCase):
    def go(self, m=None, cls="db.t4g.medium", state=OLD, guards=None, cfg=CFG):
        return d.decide(cfg, "night", inst(cls), guards or d.Guards(), state, m or quiet_week(cls), NOW)

    def test_quiet_three_days_goes_down_one_step(self):
        r = self.go()
        self.assertEqual((r.action, r.target), ("down", "db.t4g.small"))

    def test_only_at_night(self):
        self.assertEqual(self.go(guards=d.Guards(night_ok=False)).reason, "not_night")

    def test_never_below_min(self):
        r = self.go(cls="db.t4g.micro", m=quiet_week("db.t4g.micro"))
        self.assertEqual(r.reason, "at_min")
        cfg = replace(CFG, min_class="db.t4g.medium")
        self.assertEqual(self.go(cfg=cfg).reason, "at_min")

    def test_no_down_within_72h_of_an_up(self):
        st = d.State(cls="db.t4g.medium", last_up=NOW - 71 * H, last_change=NOW - 71 * H)
        self.assertEqual(self.go(state=st).reason, "cooldown_down")
        st = d.State(cls="db.t4g.medium", last_up=NOW - 73 * H, last_change=NOW - 73 * H)
        self.assertEqual(self.go(state=st).action, "down")

    def test_no_down_within_72h_of_a_down(self):
        st = d.State(cls="db.t4g.medium", last_down=NOW - 24 * H, last_change=NOW - 24 * H)
        self.assertEqual(self.go(state=st).reason, "cooldown_down")

    def test_manual_change_counts_as_a_change(self):
        st = d.reconcile_state(CFG, d.State(cls="db.t4g.small"), "db.t4g.large", NOW - 5 * H)
        self.assertEqual((st.last_up, st.last_change), (NOW - 5 * H, NOW - 5 * H))
        self.assertEqual(self.go(cls="db.t4g.large", state=st, m=quiet_week("db.t4g.large")).reason, "cooldown_down")

    def test_cpu_peak_blocks(self):
        m = quiet_week()
        cpu = list(m.cpu)
        cpu[400] = 35.0
        self.assertEqual(self.go(replace(m, cpu=tuple(cpu))).reason, "cpu_not_low")

    def test_connections_block(self):
        self.assertEqual(self.go(quiet_week(conns_pct=45)).reason, "connections_not_low")

    def test_unhealthy_memory_blocks(self):
        self.assertEqual(self.go(quiet_week(free_pct=20)).reason, "memory_not_healthy")

    def test_busy_right_now_blocks_even_if_week_was_quiet(self):
        m = quiet_week()
        m = replace(m, cpu=m.cpu[:-3] + (80.0, 80.0, 80.0))
        self.assertEqual(self.go(m).reason, "busy_now")

    def test_not_enough_history(self):
        self.assertEqual(self.go(quiet_week(n=300)).reason, "not_enough_data")

    def test_target_must_have_room_for_cpu(self):
        # 29 % of 4 cores on r7g.xlarge becomes 58 % of 2 cores... fine; 29 % * 2 = 58 < 60
        m = quiet_week("db.r7g.xlarge", cpu=29.0, free_pct=70)
        self.assertEqual(self.go(m, cls="db.r7g.xlarge").action, "down")
        # but a 4 -> 2 core step with 29 % on a 2x2 core ladder is only allowed up to 30 %
        cfg = replace(CFG, down_cpu_max_pct=40)
        m = quiet_week("db.r7g.xlarge", cpu=35.0, free_pct=70)
        self.assertEqual(self.go(m, cls="db.r7g.xlarge", cfg=cfg).reason, "target_cpu_tight")

    def test_target_burstable_must_fit_its_credit_baseline(self):
        # t4g.large -> t4g.medium (baseline 20 %): 25 % average would drain credits
        m = quiet_week("db.t4g.large", cpu=25.0, free_pct=80)
        self.assertEqual(self.go(m, cls="db.t4g.large").reason, "target_burst_tight")
        m = quiet_week("db.t4g.large", cpu=12.0, free_pct=80)
        self.assertEqual(self.go(m, cls="db.t4g.large").action, "down")

    def test_target_connections_must_fit(self):
        # medium has 396; 39 % = 154 connections > 60 % of small (198) = 118
        m = quiet_week("db.t4g.medium", conns_pct=39)
        self.assertEqual(self.go(m).reason, "target_connections_tight")

    def test_target_memory_must_fit(self):
        # medium 4 GiB, 45 % free -> 2.2 GiB in use > 70 % of 2 GiB
        m = quiet_week("db.t4g.medium", free_pct=45)
        self.assertEqual(self.go(m).reason, "target_memory_tight")
        m = quiet_week("db.t4g.medium", free_pct=68)  # 1.28 GiB used <= 1.4 GiB
        self.assertEqual(self.go(m).action, "down")
        m = quiet_week("db.t4g.large", free_pct=75, conns_pct=10)  # 2 GiB used
        self.assertEqual(self.go(m, cls="db.t4g.large").action, "down")
        m = quiet_week("db.t4g.large", free_pct=62, conns_pct=10)  # 3 GiB used > 70 % of 4
        self.assertEqual(self.go(m, cls="db.t4g.large").action, "none")

    def test_guards_apply_to_down_too(self):
        self.assertEqual(self.go(guards=d.Guards(deploying=True)).reason, "deploying")

    def test_no_flapping_after_a_down_load_stays_in_the_target_band(self):
        """What a down accepts must not trigger an up on the smaller size."""
        m = quiet_week("db.t4g.large", cpu=12.0, free_pct=80, conns_pct=20)
        r = self.go(m, cls="db.t4g.large")
        self.assertEqual(r.action, "down")
        tgt = CFG.spec(r.target)
        scaled = 12.0 * CFG.spec("db.t4g.large").vcpu / tgt.vcpu
        self.assertLess(scaled, CFG.up_cpu_pct)
        self.assertLess(20 * 792 / tgt.max_connections, CFG.up_conn_pct)


class StateAndMessageTests(unittest.TestCase):
    def test_first_run_just_remembers_the_class(self):
        st = d.reconcile_state(CFG, d.State(), "db.t4g.micro", NOW)
        self.assertEqual((st.cls, st.last_change), ("db.t4g.micro", None))

    def test_outside_down_is_recorded(self):
        st = d.reconcile_state(CFG, d.State(cls="db.t4g.large"), "db.t4g.small", NOW)
        self.assertEqual((st.last_down, st.last_up), (NOW, None))

    def test_up_message_in_russian_with_price(self):
        r = d.Decision("up", "load", "db.t4g.small", {"triggers": {"cpu": 78.0}})
        t = d.message(CFG, r, "db.t4g.micro", True)
        self.assertIn("База увеличена: db.t4g.micro → db.t4g.small (нагрузка CPU 78 %)", t)
        self.assertIn("$47/мес", t)

    def test_down_message_has_saving(self):
        r = d.Decision("down", "quiet", "db.t4g.small", {"cpu_max": 12.0, "conn_pct": 9.0})
        t = d.message(CFG, r, "db.t4g.medium", True)
        self.assertIn("База уменьшена", t)
        self.assertIn("экономия ≈ $47/мес", t)

    def test_dry_run_is_marked(self):
        r = d.Decision("up", "load", "db.t4g.small", {"triggers": {"cpu": 78.0}})
        self.assertTrue(d.message(CFG, r, "db.t4g.micro", True, dry_run=True).startswith("ПРОБНЫЙ РЕЖИМ"))


if __name__ == "__main__":
    unittest.main()
