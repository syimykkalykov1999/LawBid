"""Pure decisions of the Fargate Spot fallback (no AWS calls; tested alone).

Owner 2026-11-12 (row 67): every ECS service keeps one regular Fargate task
(base 1) and puts the tasks autoscaling adds mostly on Fargate Spot
(FARGATE weight 1 : FARGATE_SPOT weight 4). ECS never falls back to regular
Fargate by itself ("Fargate doesn't replace Spot capacity with on-demand
capacity", AWS ECS developer guide, Fargate capacity providers), so:

  fallback  Spot has no capacity (EventBridge SERVICE_TASK_PLACEMENT_FAILURE
            on FARGATE_SPOT, or the 5-minute tick sees fewer tasks running
            than wanted next to a "Capacity is unavailable" service event):
            the strategy becomes FARGATE only (FARGATE_SPOT weight 0) and a
            rolling deployment starts the missing tasks on regular Fargate.
  restore   after a quiet hold (30 min, doubled after every failure that
            follows a restore within strike_window_min, at most 6 h) the
            normal weights come back and a rolling deployment moves the
            tasks back to Spot without downtime (the old tasks stop only
            after the new ones are healthy).

The admin control (off | on | auto) comes from the app setting
`scale.spot_fallback.mode`: auto = the above (default); on = hold every
service on regular Fargate now (for a busy event); off = hands off.
"""

from dataclasses import dataclass, field, replace
from datetime import datetime, timedelta

FARGATE = "FARGATE"
SPOT = "FARGATE_SPOT"


@dataclass(frozen=True)
class Config:
    restore_after_min: int = 30
    max_hold_min: int = 360
    gap_min: int = 10
    strike_window_min: int = 120


@dataclass(frozen=True)
class Want:
    """The normal strategy of one service (from Terraform)."""

    base: int = 1
    fargate: int = 1
    spot: int = 4


@dataclass(frozen=True)
class Live:
    """What DescribeServices shows for one service."""

    strategy: tuple = ()  # ((provider, base, weight), ...)
    running: int = 0
    desired: int = 0
    spot_failure_at: datetime = None  # newest "Capacity is unavailable" event


@dataclass
class SvcState:
    fallback_since: str = None
    last_failure: str = None
    restored_at: str = None
    strikes: int = 0


@dataclass(frozen=True)
class Action:
    action: str  # none | fallback | restore
    reason: str = ""
    state: SvcState = field(default_factory=SvcState)


def normal_strategy(w):
    return ((FARGATE, w.base, w.fargate), (SPOT, 0, w.spot))


def fallback_strategy(w):
    return ((FARGATE, w.base, max(1, w.fargate)), (SPOT, 0, 0))


def weights(strategy):
    return {p: (b, wt) for p, b, wt in strategy}


def on_capacity_providers(live):
    return len(live.strategy) > 0


def is_fallback(live):
    w = weights(live.strategy)
    return SPOT in w and w[SPOT][1] == 0 or (FARGATE in w and SPOT not in w)


def is_normal(live, want):
    return weights(live.strategy) == weights(normal_strategy(want))


def _ts(s):
    return datetime.fromisoformat(s) if s else None


def hold(st, cfg):
    n = max(1, st.strikes)
    return timedelta(minutes=min(cfg.max_hold_min, cfg.restore_after_min * 2 ** (n - 1)))


def _fallback(st, cfg, now, reason):
    restored = _ts(st.restored_at)
    strikes = (
        st.strikes + 1
        if restored and now - restored < timedelta(minutes=cfg.strike_window_min)
        else 1
    )
    return Action(
        "fallback",
        reason,
        replace(st, fallback_since=now.isoformat(), last_failure=now.isoformat(), strikes=strikes),
    )


def on_failure(live, st, cfg, now, control="auto"):
    """EventBridge said: a task of this service could not get Spot capacity."""
    if control == "off" or not on_capacity_providers(live):
        return Action("none", "hands off" if control == "off" else "not on capacity providers", st)
    if is_fallback(live):
        # Already on regular Fargate: the quiet hold starts again from now.
        return Action("none", "already on regular Fargate", replace(st, last_failure=now.isoformat()))
    return _fallback(st, cfg, now, "Spot capacity unavailable (SERVICE_TASK_PLACEMENT_FAILURE)")


def on_tick(live, want, st, cfg, now, control="auto"):
    """The 5-minute look at one service."""
    if control == "off":
        return Action("none", "hands off", st)
    if not on_capacity_providers(live):
        # 13.11 (owner row 67): admin, api-admin and pgbouncer were created on
        # launch type FARGATE and the services ignore the strategy in
        # Terraform (so a fallback survives an apply) — the apply could not
        # move them. UpdateService may switch a launch type to a capacity
        # provider strategy with a forced deployment (AWS UpdateService docs);
        # apply() sends exactly that. Owner «on» (hold on regular) leaves them.
        if control == "on":
            return Action("none", "held on regular Fargate by the owner", st)
        return Action(
            "restore",
            "on launch type FARGATE: moving to the wanted Spot strategy",
            replace(st, restored_at=now.isoformat()),
        )
    if control == "on":
        if is_fallback(live):
            return Action("none", "held on regular Fargate by the owner", st)
        return _fallback(st, cfg, now, "owner holds the service on regular Fargate")
    if is_fallback(live):
        marks = [_ts(st.last_failure), _ts(st.fallback_since), live.spot_failure_at]
        last = max((x for x in marks if x), default=None)
        if last is not None and now - last < hold(st, cfg):
            return Action("none", f"quiet hold {int(hold(st, cfg).total_seconds() // 60)} min", st)
        return Action(
            "restore",
            "Spot quiet for the whole hold: back to the normal weights",
            replace(st, fallback_since=None, restored_at=now.isoformat()),
        )
    recent = live.spot_failure_at and now - live.spot_failure_at < timedelta(minutes=cfg.gap_min)
    if recent and live.running < live.desired:
        return _fallback(
            st, cfg, now, f"{live.running} of {live.desired} tasks running, Spot capacity unavailable"
        )
    if not is_normal(live, want):
        # Weights changed in Terraform (the service ignores the strategy so
        # this Lambda's fallback survives an apply): bring them in line.
        return Action("restore", "weights differ from the wanted ones", replace(st, restored_at=now.isoformat()))
    return Action("none", "normal", st)
