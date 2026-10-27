"""Pure rules of the VPC-endpoint autoscaler (no AWS calls, unit tested).

Owner rule 2026-10-25: nothing is "off forever". The four interface
endpoints (ecr.api, ecr.dkr, logs, secretsmanager) cost about $29 a month in
one AZ and only pay off when more than ~830 GB a month go through the NAT
gateway ($0.045/GB NAT processing against $0.01/GB through an endpoint).
So they start OFF and appear by themselves when NAT traffic is high, and go
away again after a week of low traffic.
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone


@dataclass(frozen=True)
class Config:
    # NAT GB per day (extrapolated from the last hours) above which endpoints
    # are created. Same number as the CloudWatch NAT alarm (S4-13).
    up_gb_per_day: float = 20.0
    # How many hourly datapoints in a row must be above it ("for 1 h").
    up_hours: int = 1
    # NAT + endpoint GB per day below which a day counts as quiet.
    down_gb_per_day: float = 10.0
    down_days: int = 7
    # Minimum time between two changes (flapping guard), hours.
    cooldown_h: float = 24.0


@dataclass(frozen=True)
class State:
    last_change: str | None = None  # ISO time
    notified: dict = field(default_factory=dict)


@dataclass(frozen=True)
class Facts:
    mode: str  # on | dry-run | off
    wanted: tuple  # service names the stack wants endpoints for
    present: tuple  # service names that have an endpoint now (ours)
    ceiling: int  # admin ceiling: most endpoints this Lambda may keep
    hourly_nat_gb: tuple  # last hours of NAT GB, oldest first
    daily_total_gb: tuple  # last days of NAT + endpoint GB, oldest first
    control: str = "auto"  # owner's admin control: auto | on | off


@dataclass(frozen=True)
class Decision:
    action: str  # none | create | delete
    services: tuple = ()
    reason: str = ""


def _hours_since(iso, now):
    if not iso:
        return 1e9
    t = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    return (now - t).total_seconds() / 3600


def decide(f: Facts, st: State, cfg: Config, now: datetime | None = None) -> Decision:
    now = now or datetime.now(timezone.utc)
    if f.mode == "off":
        return Decision("none", reason="switch is off")

    missing = tuple(s for s in f.wanted if s not in f.present)
    room = max(0, f.ceiling - len(f.present))
    # Owner's three-state control (admin «Выкл / Вкл / Авто»): off = none,
    # on = always kept (up to the ceiling), auto = by the traffic signal.
    if f.control == "off":
        if f.present:
            return Decision("delete", tuple(f.present), "switched off by the owner")
        return Decision("none", reason="switched off by the owner")
    if f.control == "on":
        if missing and room > 0:
            return Decision("create", missing[:room], "switched on by the owner")
        extra = tuple(f.present)[f.ceiling :] if len(f.present) > f.ceiling else ()
        if extra:
            return Decision("delete", extra, "above the admin ceiling")
        return Decision("none", reason="kept on by the owner")
    if _hours_since(st.last_change, now) < cfg.cooldown_h:
        return Decision("none", reason="changed less than a day ago")
    recent = f.hourly_nat_gb[-cfg.up_hours :]
    busy = len(recent) >= cfg.up_hours and all(
        gb * 24 > cfg.up_gb_per_day for gb in recent
    )
    if missing and busy:
        if room <= 0:
            return Decision("none", reason="busy, but the admin ceiling is reached")
        return Decision(
            "create",
            missing[:room],
            f"NAT traffic above {cfg.up_gb_per_day:g} GB/day for {cfg.up_hours} h",
        )

    days = f.daily_total_gb[-cfg.down_days :]
    quiet = len(days) >= cfg.down_days and all(
        gb < cfg.down_gb_per_day for gb in days
    )
    if f.present and quiet:
        return Decision(
            "delete",
            tuple(f.present),
            f"{cfg.down_days} quiet days (under {cfg.down_gb_per_day:g} GB/day)",
        )
    return Decision("none", reason="nothing to change")
