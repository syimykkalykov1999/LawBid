"""Pure decision logic of the Redis autoscaler (no AWS calls, no clock).

docs/architecture/REDIS_AUTOSCALE.md. Same shape as the database autoscaler
(infra/modules/db-autoscale/lambda/decision.py): given the size ladder, the
replication group, the guards and the metric series, `decide` answers "up",
"down" or "none" with a reason. handler.py gathers the inputs and does the work.

Metric series are lists of 5-minute points, oldest first. When the group has
several nodes (primary + replica) handler.py merges them point by point
(worst node wins), so a failover during the window changes nothing here:
  cpu       EngineCPUUtilization, Average, percent of ONE core (Redis engine thread)
  mem_pct   DatabaseMemoryUsagePercentage, Maximum, percent of maxmemory
  conns     CurrConnections, Maximum, count
  credit    CPUCreditBalance, Minimum (burstable t4g nodes only)
"""

from dataclasses import dataclass, field, replace
from typing import Optional

MIN = 60
HOUR = 3600


@dataclass(frozen=True)
class ClassSpec:
    name: str
    vcpu: int
    memory_gib: float
    max_connections: int  # ElastiCache maxclients: 65000 on every node type
    monthly_usd: float  # whole group (primary + replicas), on demand, approximate
    baseline_pct: Optional[float] = None  # CPU baseline of a burstable class
    speed: float = 1.0  # single-core speed of the engine thread, t4g = 1.0


@dataclass(frozen=True)
class Config:
    ladder: tuple  # of ClassSpec, smallest first
    min_class: str
    max_class: str
    require_failover: bool = True
    # --- up: any one trigger, held for N 5-minute points -------------------
    up_cpu_pct: float = 70
    up_cpu_points: int = 3  # 15 min
    up_mem_pct: float = 75
    up_mem_points: int = 3  # 15 min
    up_mem_fast_pct: float = 92  # one point this high = writes about to be refused (noeviction)
    up_conn_pct: float = 80
    up_conn_points: int = 3  # 15 min
    up_credit_min: float = 20  # CPU credits "near 0"
    up_credit_points: int = 3
    up_cooldown_min: int = 30
    # --- down: the whole window must be quiet ------------------------------
    down_window_h: int = 72
    down_cpu_max_pct: float = 30
    down_mem_max_pct: float = 40
    down_cooldown_h: int = 72
    down_min_coverage: float = 0.85  # share of the window that has data
    # --- the smaller size must have room (prevents up/down flapping) -------
    target_cpu_max_pct: float = 50
    target_mem_used_max_pct: float = 60  # below the 75 % up trigger, with margin
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
    """The replication group, as DescribeReplicationGroups shows it."""

    cls: str
    status: str = "available"  # group and every node group
    auto_failover: bool = True  # AutomaticFailover == enabled (online resize needs it)
    pending: bool = False  # PendingModifiedValues is not empty
    cluster_mode: bool = False  # ClusterEnabled (horizontal; this ladder is not for it)
    replicas: int = 1


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
    mem_pct: tuple = ()
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
    mem = _last(m.mem_pct, cfg.up_mem_points)
    sustained = len(mem) == cfg.up_mem_points and all(v > cfg.up_mem_pct for v in mem)
    nearly_full = bool(mem) and mem[-1] > cfg.up_mem_fast_pct
    if sustained or nearly_full:
        hit["memory"] = round(max(mem), 1)
    conns = _last(m.conns, cfg.up_conn_points)
    if len(conns) == cfg.up_conn_points and all(
        v > cur.max_connections * cfg.up_conn_pct / 100 for v in conns
    ):
        hit["connections"] = round(100 * max(conns) / cur.max_connections, 1)
    if cur.baseline_pct is not None:
        cred = _last(m.credit, cfg.up_credit_points)
        if len(cred) == cfg.up_credit_points and all(v < cfg.up_credit_min for v in cred):
            hit["credits"] = round(min(cred), 1)
    return hit


def _guard_reason(cfg, inst, g):
    if inst.status != "available":
        return "not_available"
    if inst.pending:
        return "pending_modification"
    if inst.cluster_mode:
        return "cluster_mode"
    if cfg.require_failover and (not inst.auto_failover or inst.replicas < 1):
        return "no_failover"
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
    # Every node type accepts the same 65000 clients, so a bigger node does
    # not cure "too many connections": an e-mail hint, not a resize.
    if set(hit) == {"connections"}:
        return Decision("none", "connections_high", facts=facts)
    i = cfg.index(cur.name)
    if i >= cfg.index(cfg.max_class) or i + 1 >= len(cfg.ladder):
        return Decision("none", "at_max", facts=facts)
    wait = cfg.up_cooldown_min * MIN - _since(now, state.last_up, state.last_down, state.last_change)
    if wait > 0:
        return Decision("none", "cooldown_up", facts=facts)
    return Decision("up", "load", cfg.ladder[i + 1].name, facts)


def _decide_down(cfg, cur, guards, state, m, now):
    if not guards.night_ok:
        return Decision("none", "not_night")
    i = cfg.index(cur.name)
    if i <= cfg.index(cfg.min_class) or i == 0:
        return Decision("none", "at_min")
    if _since(now, state.last_up, state.last_down, state.last_change) < cfg.down_cooldown_h * HOUR:
        return Decision("none", "cooldown_down")
    # An up condition right now means the load is not low, whatever 72 h say.
    if up_triggers(cfg, cur, m):
        return Decision("none", "busy_now")

    expected = cfg.down_window_h * HOUR // cfg.period_s
    need = int(expected * cfg.down_min_coverage)
    if min(len(m.cpu), len(m.mem_pct)) < need:
        return Decision("none", "not_enough_data")

    cpu_max = max(m.cpu)
    cpu_avg = sum(m.cpu) / len(m.cpu)
    mem_max = max(m.mem_pct)
    facts = {
        "cpu_max": round(cpu_max, 1),
        "cpu_avg": round(cpu_avg, 1),
        "mem_max": round(mem_max, 1),
    }
    if cpu_max >= cfg.down_cpu_max_pct:
        return Decision("none", "cpu_not_low", facts=facts)
    if mem_max >= cfg.down_mem_max_pct:
        return Decision("none", "memory_not_low", facts=facts)

    tgt = cfg.ladder[i - 1]
    # The engine thread is one core: only its speed matters, not the core count.
    scale = cur.speed / tgt.speed
    if cpu_max * scale > cfg.target_cpu_max_pct:
        return Decision("none", "target_cpu_tight", facts=facts)
    if tgt.baseline_pct is not None and cpu_avg * scale > cfg.target_burst_avg_ratio * tgt.baseline_pct:
        return Decision("none", "target_burst_tight", facts=facts)
    # Same share of maxmemory on every node type, so the percent scales with GiB.
    if mem_max * cur.memory_gib / tgt.memory_gib > cfg.target_mem_used_max_pct:
        return Decision("none", "target_memory_tight", facts=facts)
    return Decision("down", "quiet", tgt.name, facts)


# --- messages (plain Russian, for the owner) --------------------------------

_TRIGGER_RU = {
    "cpu": lambda v: f"нагрузка процессора Redis {v:g} %",
    "memory": lambda v: f"память занята на {v:g} %",
    "connections": lambda v: f"соединений {v:g} % от предела",
    "credits": lambda v: f"кончились «кредиты» процессора ({v:g})",
}

PAUSE_RU = "При переключении будет короткая пауза (секунды, до минуты): очереди и сокеты переподключатся сами."


def _price(spec):
    return f"${spec.monthly_usd:,.0f}"


def explain_triggers(triggers):
    return ", ".join(_TRIGGER_RU[k](v) for k, v in triggers.items())


def message(cfg, decision, from_cls, dry_run=False):
    """The e-mail / SNS text for a decision that was (or would be) carried out."""
    a, b = cfg.spec(from_cls), cfg.spec(decision.target)
    prefix = "ПРОБНЫЙ РЕЖИМ, ничего не изменено. Было бы: " if dry_run else ""
    if decision.action == "up":
        why = explain_triggers(decision.facts["triggers"])
        return (
            f"{prefix}Redis увеличен: {a.name} → {b.name} ({why}). "
            f"Цена ≈ {_price(b)}/мес вместе с репликой (было ≈ {_price(a)}). {PAUSE_RU}"
        )
    f = decision.facts
    return (
        f"{prefix}Redis уменьшен: {a.name} → {b.name} "
        f"(3 суток нагрузка была низкой: процессор до {f['cpu_max']:g} %, "
        f"память до {f['mem_max']:g} %). "
        f"Цена ≈ {_price(b)}/мес, экономия ≈ ${a.monthly_usd - b.monthly_usd:,.0f}/мес. {PAUSE_RU}"
    )


def cap_message(cfg, decision, cls):
    why = explain_triggers(decision.facts["triggers"])
    larger = cfg.index(cls) + 1 < len(cfg.ladder)
    hint = (
        "Решение за вами: поднять redis_autoscale_max_class. "
        if larger
        else "Это самый большой размер лесенки. "
    )
    return (
        f"Redis под большой нагрузкой ({why}), но уже на потолке {cls}: сам выше не поднимется. "
        + hint
        + "Если и самый большой узел тесен, дальше только кластерный режим (несколько шардов): "
        "это работа для Claude, не автоматика (docs/architecture/REDIS_AUTOSCALE.md, раздел «Горизонтальное масштабирование»)."
    )


def connections_message(triggers):
    return (
        f"В Redis много соединений ({triggers['connections']:g} % от предела 65 000). "
        "Больший размер узла предел не поднимает, поэтому размер я не менял. "
        "Скорее всего, где-то утекают соединения или слишком много задач: напишите Claude «соединения Redis»."
    )
