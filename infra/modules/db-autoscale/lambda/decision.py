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
    # Fast lane: a 2-vCPU class saturates in minutes at a launch spike (load
    # test 2026-11-02: p95 > 2 s at ~460 people, DB CPU 213 % of 200 %), so
    # waiting 15 min at 70 % is too late. Two points (10 min) above 90 % go up.
    up_cpu_fast_pct: float = 90
    up_cpu_fast_points: int = 2  # 10 min
    up_mem_free_pct: float = 10
    up_mem_points: int = 3  # 15 min
    up_conn_pct: float = 80
    up_conn_points: int = 2  # 10 min
    up_conn_fast_pct: float = 92  # one 5-min point this high = about to refuse logins
    up_credit_min: float = 20  # CPU credits "near 0"
    up_credit_points: int = 3
    up_cooldown_min: int = 30
    # --- down: the whole window must be quiet ------------------------------
    # Owner 12.11 (KNOWN_ERRORS 109): 6 h of calm, 6 h after the last change,
    # and only inside the night window (single-AZ resize = minutes of downtime).
    # Then straight to the smallest size the measured peak fits (target
    # tracking, like AWS Application Auto Scaling), not one step per 3 days.
    down_window_h: int = 6
    down_cpu_max_pct: float = 30
    down_conn_max_pct: float = 40
    down_mem_free_min_pct: float = 30
    down_cooldown_h: int = 6
    down_min_coverage: float = 0.85  # share of the window that has data
    # --- the smaller size must have room (prevents up/down flapping) -------
    target_cpu_max_pct: float = 60
    target_conn_max_pct: float = 60
    target_mem_used_max_pct: float = 70
    target_burst_avg_ratio: float = 0.8  # of the CPU baseline
    # shared_buffers is reserved memory that FreeableMemory never shows as
    # free; RDS sets it to {DBInstanceClassMemory/32768} pages of 8 KiB = 25 %
    # of the class memory, so it shrinks with the class (lawbid-prod-postgres16).
    shared_buffers_ratio: float = 0.25
    # --- single-AZ database: owner 14.11, grow anyway under SUSTAINED
    # overload (minutes of pause accepted), with a higher bar than Multi-AZ:
    # every trigger held this many 5-min points, no fast lanes.
    single_node_up: bool = True
    single_up_points: int = 6  # 30 min
    # --- the shrink window (hours of NIGHT_TZ, start inclusive, end
    # exclusive; may cross midnight). Owner 14.11: a test opens it now
    # through TUNING with the same apply and puts it back the same way.
    night_start_h: int = 1
    night_end_h: int = 6
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
    # Read replicas do NOT pause resizing (KNOWN_ERRORS 109): a replica may
    # have another class, and RDS raises the replica's max_connections etc.
    # itself when the primary's are higher (AWS RDS PostgreSQL docs,
    # "Setting the parameters that control shared memory"). Kept for the log.
    has_replicas: bool = False
    # Owner row 6 (13.11): our own read copies (`<db>-replica-N`, modules/
    # growth). They follow the primary's class (handler.follow_replicas).
    replica_ids: tuple = ()


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
    # Item 28 (AU4): since when a CPU-only "up" waits for a read copy.
    read_out_since: Optional[float] = None


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
    "down" for down_cooldown_h hours.
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
    else:
        fast = _last(m.cpu, cfg.up_cpu_fast_points)
        if len(fast) == cfg.up_cpu_fast_points and all(
            v > cfg.up_cpu_fast_pct for v in fast
        ):
            hit["cpu_fast"] = round(sum(fast) / len(fast), 1)
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
        # 15.11 (prod log): a class just shrunk starts with an empty credit
        # balance, and RDS / ElastiCache t4g run in unlimited mode, so an
        # empty balance alone never slows them (AWS: "burstable performance
        # instances in unlimited mode": throttling only in standard mode).
        # The trigger counts only while the CPU also runs at or above the
        # class baseline, i.e. the credits are really being spent.
        cred = _last(m.credit, cfg.up_credit_points)
        busy = _last(m.cpu, cfg.up_credit_points)
        if (
            len(cred) == cfg.up_credit_points
            and all(v < cfg.up_credit_min for v in cred)
            and len(busy) == cfg.up_credit_points
            and all(v >= cur.baseline_pct for v in busy)
        ):
            hit["credits"] = round(min(cred), 1)
    return hit


def _guard_reason(cfg, inst, g, mode):
    if inst.status != "available":
        return "not_available"
    if inst.pending:
        return "pending_modification"
    # Single-AZ: a resize is minutes of downtime. Growing happens under load in
    # the day, so it needs Multi-AZ; shrinking runs only in the night window,
    # where the owner accepts that pause (12.11).
    if mode != "night" and cfg.require_multi_az and not inst.multi_az:
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
    bad = _guard_reason(cfg, inst, guards, mode)
    # 14.11 (prod log): every tick said «not_multi_az» and the shrink had
    # only the one 03:30 night run; a deploy or a busy minute then cost a
    # whole day. Inside the night window every tick is also a shrink try
    # with the night's rules (6 quiet hours, all other guards).
    night_tick = mode == "tick" and guards.night_ok
    if bad == "not_multi_az" and mode == "tick":
        bad = _guard_reason(cfg, inst, guards, "night")
        if bad:
            return Decision("none", bad)
        if cfg.single_node_up:
            up = _decide_up(_single_node_cfg(cfg), cur, state, metrics, now)
            if up.action == "up":
                return replace(up, reason="load_single_node")
            if up.reason != "calm":
                return up
        if night_tick:
            return _decide_down(cfg, cur, guards, state, metrics, now)
        return Decision("none", "not_multi_az")
    if bad:
        return Decision("none", bad)
    if mode == "tick":
        up = _decide_up(cfg, cur, state, metrics, now)
        if up.reason == "calm" and night_tick:
            down = _decide_down(cfg, cur, guards, state, metrics, now)
            if down.action == "down":
                return down
        return up
    if mode == "night":
        return _decide_down(cfg, cur, guards, state, metrics, now)
    return Decision("none", "bad_mode")


@dataclass(frozen=True)
class ReplicaFirst:
    """Item 28 (AU4, owner 25.11): the owner's «read copy first» control,
    copied by the economy job into ops/scale-controls.json (db_replica_first,
    economy.rules.ts replicaFirstControl). Unreadable = off (today's resize)."""

    mode: str = "off"  # off | on | auto
    wait_min: int = 60
    max_replicas: int = 5
    possible: bool = False  # a read copy can really come and take reads


# Only sustained CPU waits for a copy: a copy takes reads off the primary's
# CPU, but not its memory or its connection limit, and the 90 % fast lane is
# an emergency (minutes to saturation, a copy needs ~15-20 to be created).
READ_OUT_TRIGGERS = frozenset({"cpu"})


def replica_first(dec, rf, inst, state, now):
    """(decision, state): scale reads out first, the primary up second.

    AWS RDS user guide ("Working with DB instance read replicas": replicas
    scale beyond one instance for read-heavy loads) and Instagram / OpenAI
    (January 2026) Postgres: reads grow with copies, the primary grows for
    writes. A CPU-only "up" is held while fewer than rf.max_replicas own
    copies run, for at most rf.wait_min minutes from the first hold; then
    the primary grows as before (the copies follow its class). on = always
    hold; auto = hold only while a copy can come (rf.possible); off = never.
    """
    triggers = set((dec.facts or {}).get("triggers", {}))
    holdable = dec.action == "up" and bool(triggers) and triggers <= READ_OUT_TRIGGERS
    active = rf.mode == "on" or (rf.mode == "auto" and rf.possible)
    copies = len(inst.replica_ids)
    if not (holdable and active and copies < rf.max_replicas):
        if state.read_out_since is not None:
            state = replace(state, read_out_since=None)
        return dec, state
    since = state.read_out_since if state.read_out_since is not None else now
    waited = now - since
    if waited >= rf.wait_min * MIN:
        facts = dict(dec.facts, read_out_waited_min=round(waited / MIN), copies=copies)
        return replace(dec, facts=facts), replace(state, read_out_since=None)
    facts = dict(dec.facts, copies=copies, waited_min=round(waited / MIN),
                 wait_min=rf.wait_min, target=dec.target)
    return Decision("none", "replica_first", facts=facts), replace(state, read_out_since=since)


def _single_node_cfg(cfg):
    """The higher bar for growing a single-AZ database (owner 14.11)."""
    n = cfg.single_up_points
    return replace(
        cfg,
        up_cpu_points=max(cfg.up_cpu_points, n),
        up_cpu_fast_pct=1000,  # no fast lane
        up_mem_points=max(cfg.up_mem_points, n),
        up_conn_points=max(cfg.up_conn_points, n),
        up_conn_fast_pct=1000,
        up_credit_points=max(cfg.up_credit_points, n),
    )


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
    # An up condition right now means the load is not low, whatever the window says.
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

    # Smallest first: the first size where the measured peak stays inside the
    # target band wins. None fits: report why the next size down does not.
    lo = max(cfg.index(cfg.min_class), 0)
    first_fail = None
    for j in range(lo, i):
        why = _target_tight(cfg, cur, cfg.ladder[j], cpu_max, cpu_avg, conn_max, total - free_min)
        if why is None:
            return Decision("down", "quiet", cfg.ladder[j].name, facts)
        if j == i - 1:
            first_fail = why
    return Decision("none", first_fail or "target_tight", facts=facts)


def _target_tight(cfg, cur, tgt, cpu_max, cpu_avg, conn_max, used):
    """None when the load measured on `cur` fits `tgt`, else the reason."""
    scale = cur.vcpu / tgt.vcpu
    if cpu_max * scale > cfg.target_cpu_max_pct:
        return "target_cpu_tight"
    if tgt.baseline_pct is not None and (
        cpu_avg * scale > cfg.target_burst_avg_ratio * tgt.baseline_pct
    ):
        return "target_burst_tight"
    if conn_max > tgt.max_connections * cfg.target_conn_max_pct / 100:
        return "target_connections_tight"
    r = cfg.shared_buffers_ratio
    other = max(0.0, used - r * cur.memory_gib * GIB)  # used outside shared_buffers
    if other + r * tgt.memory_gib * GIB > tgt.memory_gib * GIB * cfg.target_mem_used_max_pct / 100:
        return "target_memory_tight"
    return None


# --- messages (plain Russian, for the owner) --------------------------------

_TRIGGER_RU = {
    "cpu": lambda v: f"нагрузка CPU {v:g} %",
    "cpu_fast": lambda v: f"быстрая полоса: CPU почти на пределе, {v:g} % уже 10 минут",
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
        f"({cfg.down_window_h:g} ч нагрузка была низкой: CPU до {f['cpu_max']:g} %, "
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
