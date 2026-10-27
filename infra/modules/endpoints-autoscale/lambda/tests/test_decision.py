import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import decision as d  # noqa: E402

NOW = datetime(2026, 10, 25, 12, tzinfo=timezone.utc)
SVC = ("ecr.api", "ecr.dkr", "logs", "secretsmanager")


def facts(**kw):
    base = dict(
        mode="on",
        wanted=SVC,
        present=(),
        ceiling=4,
        hourly_nat_gb=(0.1,),
        daily_total_gb=(1.0,) * 7,
    )
    base.update(kw)
    return d.Facts(**base)


def test_off_does_nothing():
    f = facts(mode="off", hourly_nat_gb=(5.0,))
    assert d.decide(f, d.State(), d.Config(), NOW).action == "none"


def test_busy_hour_creates_all_wanted():
    r = d.decide(facts(hourly_nat_gb=(1.0,)), d.State(), d.Config(), NOW)
    assert r.action == "create" and r.services == SVC


def test_quiet_nat_creates_nothing():
    assert d.decide(facts(), d.State(), d.Config(), NOW).action == "none"


def test_admin_ceiling_limits_and_zero_blocks():
    r = d.decide(facts(hourly_nat_gb=(1.0,), ceiling=2), d.State(), d.Config(), NOW)
    assert r.services == SVC[:2]
    r0 = d.decide(facts(hourly_nat_gb=(1.0,), ceiling=0), d.State(), d.Config(), NOW)
    assert r0.action == "none"


def test_week_of_quiet_removes():
    r = d.decide(facts(present=SVC), d.State(), d.Config(), NOW)
    assert r.action == "delete" and r.services == SVC


def test_one_busy_day_keeps_them():
    days = (1.0,) * 6 + (30.0,)
    r = d.decide(facts(present=SVC, daily_total_gb=days), d.State(), d.Config(), NOW)
    assert r.action == "none"


def test_less_than_a_week_of_data_keeps_them():
    r = d.decide(facts(present=SVC, daily_total_gb=(1.0,) * 3), d.State(), d.Config(), NOW)
    assert r.action == "none"


def test_cooldown_blocks_flapping():
    st = d.State(last_change=(NOW - timedelta(hours=3)).isoformat())
    r = d.decide(facts(hourly_nat_gb=(1.0,)), st, d.Config(), NOW)
    assert r.action == "none"


def test_owner_off_removes_and_blocks():
    assert d.decide(facts(present=SVC, control="off", hourly_nat_gb=(9.0,)), d.State(), d.Config(), NOW).action == "delete"
    assert d.decide(facts(control="off", hourly_nat_gb=(9.0,)), d.State(), d.Config(), NOW).action == "none"


def test_owner_on_creates_without_traffic_and_never_deletes():
    r = d.decide(facts(control="on"), d.State(), d.Config(), NOW)
    assert r.action == "create" and r.services == SVC
    assert d.decide(facts(control="on", present=SVC), d.State(), d.Config(), NOW).action == "none"


def test_owner_override_ignores_cooldown():
    st = d.State(last_change=(NOW - timedelta(hours=1)).isoformat())
    assert d.decide(facts(control="on"), st, d.Config(), NOW).action == "create"
