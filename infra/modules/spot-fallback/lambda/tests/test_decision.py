"""Fallback to regular Fargate and back to Spot: the pure decisions."""

import os
import sys
import unittest
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import decision as d  # noqa: E402

NOW = datetime(2026, 11, 12, 12, tzinfo=timezone.utc)
CFG = d.Config()
WANT = d.Want(base=1, fargate=1, spot=4)
NORMAL = d.normal_strategy(WANT)
FALLBACK = d.fallback_strategy(WANT)


def live(strategy=NORMAL, running=5, desired=5, fail_ago_min=None):
    return d.Live(
        strategy=strategy,
        running=running,
        desired=desired,
        spot_failure_at=None if fail_ago_min is None else NOW - timedelta(minutes=fail_ago_min),
    )


def ago(minutes):
    return (NOW - timedelta(minutes=minutes)).isoformat()


class Strategies(unittest.TestCase):
    def test_normal_is_base_one_and_one_to_four(self):
        self.assertEqual(NORMAL, (("FARGATE", 1, 1), ("FARGATE_SPOT", 0, 4)))

    def test_fallback_keeps_base_and_drops_spot_to_zero(self):
        self.assertEqual(FALLBACK, (("FARGATE", 1, 1), ("FARGATE_SPOT", 0, 0)))
        self.assertTrue(d.is_fallback(live(FALLBACK)))
        self.assertFalse(d.is_fallback(live(NORMAL)))


class Failure(unittest.TestCase):
    def test_spot_failure_falls_back_at_once(self):
        a = d.on_failure(live(), d.SvcState(), CFG, NOW)
        self.assertEqual(a.action, "fallback")
        self.assertEqual(a.state.fallback_since, NOW.isoformat())
        self.assertEqual(a.state.strikes, 1)

    def test_already_on_regular_only_restarts_the_hold(self):
        st = d.SvcState(fallback_since=ago(20), last_failure=ago(20), strikes=1)
        a = d.on_failure(live(FALLBACK), st, CFG, NOW)
        self.assertEqual(a.action, "none")
        self.assertEqual(a.state.last_failure, NOW.isoformat())

    def test_failure_soon_after_restore_doubles_the_next_hold(self):
        st = d.SvcState(restored_at=ago(40), strikes=1)
        a = d.on_failure(live(), st, CFG, NOW)
        self.assertEqual(a.state.strikes, 2)
        self.assertEqual(d.hold(a.state, CFG), timedelta(minutes=60))

    def test_failure_long_after_restore_starts_over(self):
        st = d.SvcState(restored_at=ago(500), strikes=4)
        self.assertEqual(d.on_failure(live(), st, CFG, NOW).state.strikes, 1)

    def test_hold_never_above_six_hours(self):
        self.assertEqual(d.hold(d.SvcState(strikes=20), CFG), timedelta(minutes=360))

    def test_owner_off_is_hands_off(self):
        self.assertEqual(d.on_failure(live(), d.SvcState(), CFG, NOW, "off").action, "none")

    def test_service_still_on_launch_type_is_left_alone(self):
        self.assertEqual(d.on_failure(live(()), d.SvcState(), CFG, NOW).action, "none")


class Tick(unittest.TestCase):
    def test_missed_event_backstop_gap_and_capacity_message(self):
        a = d.on_tick(live(running=3, desired=5, fail_ago_min=2), WANT, d.SvcState(), CFG, NOW)
        self.assertEqual(a.action, "fallback")

    def test_gap_without_spot_message_is_normal_scaling(self):
        a = d.on_tick(live(running=3, desired=5), WANT, d.SvcState(), CFG, NOW)
        self.assertEqual(a.action, "none")

    def test_old_spot_message_with_full_count_is_fine(self):
        a = d.on_tick(live(fail_ago_min=2), WANT, d.SvcState(), CFG, NOW)
        self.assertEqual(a.action, "none")

    def test_stays_on_regular_during_the_hold(self):
        st = d.SvcState(fallback_since=ago(10), last_failure=ago(10), strikes=1)
        self.assertEqual(d.on_tick(live(FALLBACK), WANT, st, CFG, NOW).action, "none")

    def test_new_capacity_message_during_fallback_extends_the_hold(self):
        st = d.SvcState(fallback_since=ago(45), last_failure=ago(45), strikes=1)
        a = d.on_tick(live(FALLBACK, fail_ago_min=5), WANT, st, CFG, NOW)
        self.assertEqual(a.action, "none")

    def test_back_to_spot_after_the_quiet_hold(self):
        st = d.SvcState(fallback_since=ago(31), last_failure=ago(31), strikes=1)
        a = d.on_tick(live(FALLBACK), WANT, st, CFG, NOW)
        self.assertEqual(a.action, "restore")
        self.assertIsNone(a.state.fallback_since)
        self.assertEqual(a.state.restored_at, NOW.isoformat())
        self.assertEqual(a.state.strikes, 1)

    def test_second_strike_waits_an_hour(self):
        st = d.SvcState(fallback_since=ago(45), last_failure=ago(45), strikes=2)
        self.assertEqual(d.on_tick(live(FALLBACK), WANT, st, CFG, NOW).action, "none")
        st = d.SvcState(fallback_since=ago(61), last_failure=ago(61), strikes=2)
        self.assertEqual(d.on_tick(live(FALLBACK), WANT, st, CFG, NOW).action, "restore")

    def test_owner_on_holds_on_regular_and_never_restores(self):
        a = d.on_tick(live(), WANT, d.SvcState(), CFG, NOW, "on")
        self.assertEqual(a.action, "fallback")
        st = d.SvcState(fallback_since=ago(999), last_failure=ago(999), strikes=1)
        self.assertEqual(d.on_tick(live(FALLBACK), WANT, st, CFG, NOW, "on").action, "none")

    def test_terraform_weights_changed_are_applied(self):
        old = (("FARGATE", 1, 1), ("FARGATE_SPOT", 0, 1))
        self.assertEqual(d.on_tick(live(old), WANT, d.SvcState(), CFG, NOW).action, "restore")

    def test_normal_does_nothing(self):
        self.assertEqual(d.on_tick(live(), WANT, d.SvcState(), CFG, NOW).action, "none")


if __name__ == "__main__":
    unittest.main()


class LaunchType(unittest.TestCase):
    """13.11 row 67: a watched service still on launch type FARGATE (no
    capacity provider strategy) is moved to the wanted Spot strategy."""

    def test_launch_type_service_is_moved_to_spot(self):
        a = d.on_tick(live(strategy=[]), WANT, d.SvcState(), CFG, NOW)
        self.assertEqual(a.action, "restore")

    def test_owner_hold_and_off_leave_it(self):
        self.assertEqual(d.on_tick(live(strategy=[]), WANT, d.SvcState(), CFG, NOW, control="on").action, "none")
        self.assertEqual(d.on_tick(live(strategy=[]), WANT, d.SvcState(), CFG, NOW, control="off").action, "none")

    def test_failure_event_on_launch_type_does_nothing(self):
        self.assertEqual(d.on_failure(live(strategy=[]), d.SvcState(), CFG, NOW).action, "none")
