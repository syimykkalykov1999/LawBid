"""Pure decision logic of the database autoscaler (no AWS calls, no clock).

docs/architecture/DB_AUTOSCALE.md. Given the size ladder, the current
instance, the guards and the metric series, `decide` answers "up", "down"
or "none" with a reason. handler.py gathers the inputs and does the work.

Metric series are lists of 5-minute points, oldest first:
  cpu       CPUUtilization, Average, percent
  mem_free  FreeableMemory, Minimum, bytes
  conns     DatabaseConnections, Maximum, count
  credit    CPUCreditBalance, Minimum (burstable t4g classes only)
"""

from dataclasses import dataclass, field, replace
from typing import Optional

GIB = 1024**3
MIN = 60
HOUR = 3600


@dataclass(frozen=True)
class ClassSpec:
    name: str
    vcpu: int
    memory_gib: float
    max_connections: int
    monthly_usd: float  # Multi-AZ, on demand, approximate
    baseline_pct: Optional[float] = None  # CPU baseline of a burstable class


@dataclass(frozen=True)
class Config:
    ladder: tuple  # of ClassSpec, smallest first
    min_class: str
    max_class: str
    require_multi_az: bool = True
    # --- up: any one trigger, held for N 5-minute points -------------------
    up_cpu_pct: float = 70
    up_cpu_points: int = 3  # 15 min
    up_mem_free_pct: float = 10
    up_mem_points: int = 3  # 15 min
    up_conn_pct: float = 80
    up_conn_points: int = 2  # 10 min
    up_conn_fast_pct: float = 92  # one 5-min point this high = about to refuse logins
    up_credit_min: float = 20  # CPU credits "near 0"
    up_credit_points: int = 3
    up_cooldown_min: int = 30
    # --- down: the whole window must be quiet ------------------------------
    down_window_h: int = 72
    down_cpu_max_pct: float = 30
    down_conn_max_pct: float = 40
    down_mem_free_min_pct: float = 30
    down_cooldown_h: int = 72
    down_min_coverage: float = 0.85  # share of the window that has data
    # --- the smaller size must have room (prevents up/down flapping) -------
    target_cpu_max_pct: float = 60
    target_conn_max_pct: float = 60
    target_mem_used_max_pct: float = 70
    target_burst_avg_ratio: float = 0.8  # of the CPU baseline
    period_s: int = 300

    def spec(self, name):
        for s in self.ladder:
            if s.name == name:
                return s
        return None

    def index(self, name):
        for i, s in enumerate(self.ladder):
            if s.name == name:
                return i
        return -1


@dataclass(frozen=True)
class Instance:
    cls: str
    status: str = "available"
    multi_az: bool = True
    pending: bool = False  # PendingModifiedValues is not empty
    has_replicas: bool = False


@dataclass(frozen=True)
class Guards:
    deploying: bool = False  # an ECS rollout of api / worker is running
    oneoff_tasks: bool = False  # migrate / i18n one-off task is running
    ecs_unknown: bool = False  # the ECS state could not be read
    night_ok: bool = True  # local time is inside the night window


@dataclass(frozen=True)
class State:
    """Kept in an SSM parameter. Times are epoch seconds."""

    cls: Optional[str] = None  # the size we last saw / set
    last_up: Optional[float] = None
    last_down: Optional[float] = None
    last_change: Optional[float] = None  # any size change, ours or not
    notified: dict = field(default_factory=dict)  # throttle: key -> epoch


@dataclass(frozen=True)
class Metrics:
    cpu: tuple = ()
    mem_free: tuple = ()
    conns: tuple = ()
    credit: tuple = ()


@dataclass(frozen=True)
class Decision:
    action: str  # "up" | "down" | "none"
    reason: str  # short code
    target: Optional[str] = None
    facts: dict = field(default_factory=dict)  # numbers for the message


def reconcile_state(cfg, state, current_cls, now):
    """Notice a size change made by somebody else (admin button, console).

    It counts as a change now, so a manual "up" also blocks an automatic
    "down" for 72 hours.
    """
    if state.cls is None:
        return replace(state, cls=current_cls)
    if state.cls == current_cls:
        return state
    new = replace(state, cls=current_cls, last_change=now)
    a, b = cfg.index(state.cls), cfg.index(current_cls)
    if a >= 0 and b >= 0 and b > a:
        return replace(new, last_up=now)
    if a >= 0 and b >= 0 and b < a:
        return replace(new, last_down=now)
    return new


def _last(series, n):
    return list(series)[-n:]


def _since(now, *times):
    """Seconds since the latest of the given times (inf when none)."""
    known = [t for t in times if t is not None]
    return float("inf") if not known else now - max(known)


def up_triggers(cfg, cur, m):
    """Which up conditions hold. Returns {name: value-for-the-message}."""
    hit = {}
    cpu = _last(m.cpu, cfg.up_cpu_points)
    if len(cpu) == cfg.up_cpu_points and all(v > cfg.up_cpu_pct for v in cpu):
        hit["cpu"] = round(sum(cpu) / len(cpu), 1)
    mem = _last(m.mem_free, cfg.up_mem_points)
    total = cur.memory_gib * GIB
    if len(mem) == cfg.up_mem_points and all(
        v < total * cfg.up_mem_free_pct / 100 for v in mem
    ):
        hit["memory"] = round(100 * (sum(mem) / len(mem)) / total, 1)  # free %
    conns = _last(m.conns, cfg.up_conn_points)
    sustained = len(conns) == cfg.up_conn_points and all(
        v > cur.max_connections * cfg.up_conn_pct / 100 for v in conns
    )
    nearly_full = bool(conns) and conns[-1] > cur.max_connections * cfg.up_conn_fast_pct / 100
    if sustained or nearly_full:
        hit["connections"] = round(100 * max(conns) / cur.max_connections, 1)
    if cur.baseline_pct is not None:
        cred = _last(m.credit, cfg.up_credit_points)
        if len(cred) == cfg.up_credit_points and all(
            v < cfg.up_credit_min for v in cred
        ):
            hit["credits"] = round(min(cred), 1)
    return hit


def _guard_reason(cfg, inst, g):
    if inst.status != "available":
        return "not_available"
    if inst.pending:
        return "pending_modification"
    if inst.has_replicas:
        return "has_replicas"
    if cfg.require_multi_az and not inst.multi_az:
        return "not_multi_az"
    if g.ecs_unknown:
        return "ecs_unknown"
    if g.deploying:
        return "deploying"
    if g.oneoff_tasks:
        return "oneoff_tasks"
    return None


def decide(cfg, mode, inst, guards, state, metrics, now):
    """mode "tick" looks for a reason to grow, "night" for a reason to shrink."""
    cur = cfg.spec(inst.cls)
    if cur is None:
        return Decision("none", "unknown_class")
    bad = _guard_reason(cfg, inst, guards)
    if bad:
        return Decision("none", bad)
    if mode == "tick":
        return _decide_up(cfg, cur, state, metrics, now)
    if mode == "night":
        return _decide_down(cfg, cur, guards, state, metrics, now)
    return Decision("none", "bad_mode")


def _decide_up(cfg, cur, state, m, now):
    hit = up_triggers(cfg, cur, m)
    if not hit:
        return Decision("none", "calm")
    facts = {"triggers": hit}
    i = cfg.index(cur.name)
    if i >= cfg.index(cfg.max_class) or i + 1 >= len(cfg.ladder):
        return Decision("none", "at_max", facts=facts)
    wait = cfg.up_cooldown_min * MIN - _since(
        now, state.last_up, state.last_down, state.last_change
    )
    if wait > 0:
        return Decision("none", "cooldown_up", facts=facts)
    return Decision("up", "load", cfg.ladder[i + 1].name, facts)


def _decide_down(cfg, cur, guards, state, m, now):
    if not guards.night_ok:
        return Decision("none", "not_night")
    i = cfg.index(cur.name)
    if i <= cfg.index(cfg.min_class) or i == 0:
        return Decision("none", "at_min")
    if (
        _since(now, state.last_up, state.last_down, state.last_change)
        < cfg.down_cooldown_h * HOUR
    ):
        return Decision("none", "cooldown_down")
    # An up condition right now means the load is not low, whatever 72 h say.
    if up_triggers(cfg, cur, m):
        return Decision("none", "busy_now")

    expected = cfg.down_window_h * HOUR // cfg.period_s
    need = int(expected * cfg.down_min_coverage)
    if min(len(m.cpu), len(m.conns), len(m.mem_free)) < need:
        return Decision("none", "not_enough_data")

    cpu_max = max(m.cpu)
    cpu_avg = sum(m.cpu) / len(m.cpu)
    conn_max = max(m.conns)
    free_min = min(m.mem_free)
    total = cur.memory_gib * GIB
    facts = {
        "cpu_max": round(cpu_max, 1),
        "cpu_avg": round(cpu_avg, 1),
        "conn_pct": round(100 * conn_max / cur.max_connections, 1),
        "mem_free_pct": round(100 * free_min / total, 1),
    }
    if cpu_max >= cfg.down_cpu_max_pct:
        return Decision("none", "cpu_not_low", facts=facts)
    if conn_max >= cur.max_connections * cfg.down_conn_max_pct / 100:
        return Decision("none", "connections_not_low", facts=facts)
    if free_min < total * cfg.down_mem_free_min_pct / 100:
        return Decision("none", "memory_not_healthy", facts=facts)

    tgt = cfg.ladder[i - 1]
    scale = cur.vcpu / tgt.vcpu
    if cpu_max * scale > cfg.target_cpu_max_pct:
        return Decision("none", "target_cpu_tight", facts=facts)
    if tgt.baseline_pct is not None and (
        cpu_avg * scale > cfg.target_burst_avg_ratio * tgt.baseline_pct
    ):
        return Decision("none", "target_burst_tight", facts=facts)
    if conn_max > tgt.max_connections * cfg.target_conn_max_pct / 100:
        return Decision("none", "target_connections_tight", facts=facts)
    used = total - free_min
    if used > tgt.memory_gib * GIB * cfg.target_mem_used_max_pct / 100:
        return Decision("none", "target_memory_tight", facts=facts)
    return Decision("down", "quiet", tgt.name, facts)


# --- messages (plain Russian, for the owner) --------------------------------

_TRIGGER_RU = {
    "cpu": lambda v: f"нагрузка CPU {v:g} %",
    "memory": lambda v: f"свободной памяти осталось {v:g} %",
    "connections": lambda v: f"соединений {v:g} % от предела",
    "credits": lambda v: f"кончились «кредиты» процессора ({v:g})",
}


def _price(spec, multi_az):
    usd = spec.monthly_usd if multi_az else spec.monthly_usd / 2
    return f"${usd:,.0f}"


def _saving(a, b, multi_az):
    k = 1 if multi_az else 0.5
    return f"${(a.monthly_usd - b.monthly_usd) * k:,.0f}"


def explain_triggers(triggers):
    return ", ".join(_TRIGGER_RU[k](v) for k, v in triggers.items())


def message(cfg, decision, from_cls, multi_az, dry_run=False):
    """The e-mail / SNS text for a decision that was (or would be) carried out."""
    a, b = cfg.spec(from_cls), cfg.spec(decision.target)
    prefix = "ПРОБНЫЙ РЕЖИМ, ничего не изменено. Было бы: " if dry_run else ""
    if decision.action == "up":
        why = explain_triggers(decision.facts["triggers"])
        return (
            f"{prefix}База увеличена: {a.name} → {b.name} ({why}). "
            f"Цена ≈ {_price(b, multi_az)}/мес (было ≈ {_price(a, multi_az)}). "
            "При переключении будет короткая пауза, около минуты."
        )
    f = decision.facts
    return (
        f"{prefix}База уменьшена: {a.name} → {b.name} "
        f"(3 суток нагрузка была низкой: CPU до {f['cpu_max']:g} %, "
        f"соединения до {f['conn_pct']:g} % от предела). "
        f"Цена ≈ {_price(b, multi_az)}/мес, экономия ≈ "
        f"{_saving(a, b, multi_az)}/мес. "
        "При переключении будет короткая пауза, около минуты."
    )


def cap_message(cfg, decision, cls):
    why = explain_triggers(decision.facts["triggers"])
    return (
        f"База под большой нагрузкой ({why}), но уже на потолке {cls}: "
        "сама выше не поднимется. Решение за вами: поднять db_autoscale_max_class."
    )
