import {
  effectivePriority,
  shedDecision,
  tierThreshold,
  type ShedThresholds,
} from './shed-priority';

const T: ShedThresholds = {
  mode: 'on',
  lagCriticalMs: 500,
  lagStartMs: 200,
  cpuCriticalPct: 95,
  cpuStartPct: 75,
  inFlightStartPct: 70,
};
const calm = { lagMs: 0, cpuPct: 10, inFlight: 0, limit: 0 };

describe('effectivePriority (item 21)', () => {
  it('route level wins; no level = degraded; admin routes = critical', () => {
    expect(effectivePriority('critical', undefined, '/api/v1/auth/login')).toBe(
      'critical',
    );
    expect(effectivePriority(undefined, undefined, '/api/v1/feed')).toBe(
      'degraded',
    );
    expect(
      effectivePriority(undefined, undefined, '/api/v1/admin/config'),
    ).toBe('critical');
  });

  it('the client header only lowers the priority, never raises it', () => {
    expect(effectivePriority(undefined, 'prefetch', '/api/v1/feed')).toBe(
      'best_effort',
    );
    expect(effectivePriority(undefined, 'background', '/api/v1/feed')).toBe(
      'bulk',
    );
    expect(effectivePriority('bulk', 'degraded', '/api/v1/app-events')).toBe(
      'bulk',
    );
    expect(effectivePriority('critical', ['Prefetch'], '/x')).toBe(
      'best_effort',
    );
    expect(effectivePriority(undefined, 'critical', '/api/v1/feed')).toBe(
      'degraded',
    );
  });
});

describe('tierThreshold (Netflix: progressively more critical traffic)', () => {
  it('spreads the four levels evenly from start to critical', () => {
    expect(tierThreshold('bulk', 200, 500)).toBe(200);
    expect(tierThreshold('best_effort', 200, 500)).toBe(300);
    expect(tierThreshold('degraded', 200, 500)).toBe(400);
    expect(tierThreshold('critical', 200, 500)).toBe(500);
  });
  it('start 0 or not below critical = one threshold for all', () => {
    expect(tierThreshold('bulk', 0, 500)).toBe(500);
    expect(tierThreshold('bulk', 600, 500)).toBe(500);
  });
});

describe('shedDecision (item 21)', () => {
  it('a calm server sheds nothing', () => {
    for (const level of ['bulk', 'degraded', 'critical'] as const) {
      expect(shedDecision(level, calm, T)).toBeNull();
    }
  });

  it('Выкл never sheds, whatever the load', () => {
    const hot = { lagMs: 9999, cpuPct: 100, inFlight: 9999, limit: 10 };
    expect(shedDecision('bulk', hot, { ...T, mode: 'off' })).toBeNull();
  });

  it('event-loop lag: background first, critical only at the top', () => {
    const s = { ...calm, lagMs: 350 };
    expect(shedDecision('bulk', s, T)).toBe('event_loop_lag');
    expect(shedDecision('best_effort', s, T)).toBe('event_loop_lag');
    expect(shedDecision('degraded', s, T)).toBeNull();
    expect(shedDecision('critical', s, T)).toBeNull();
    expect(shedDecision('critical', { ...calm, lagMs: 501 }, T)).toBe(
      'event_loop_lag',
    );
  });

  it('CPU: Netflix-style — non-critical at the start, critical at the top', () => {
    const s = { ...calm, cpuPct: 85 };
    expect(shedDecision('bulk', s, T)).toBe('cpu');
    expect(shedDecision('degraded', s, T)).toBeNull();
    expect(shedDecision('critical', { ...calm, cpuPct: 96 }, T)).toBe('cpu');
    expect(
      shedDecision(
        'bulk',
        { ...calm, cpuPct: 100 },
        { ...T, cpuCriticalPct: 0 },
      ),
    ).toBeNull();
  });

  it('concurrency limit: background at 70 % of it, critical at the limit', () => {
    const at = (inFlight: number) => ({ ...calm, inFlight, limit: 100 });
    expect(shedDecision('bulk', at(69), T)).toBeNull();
    expect(shedDecision('bulk', at(70), T)).toBe('in_flight');
    expect(shedDecision('degraded', at(80), T)).toBeNull();
    expect(shedDecision('degraded', at(90), T)).toBe('in_flight');
    expect(shedDecision('critical', at(99), T)).toBeNull();
    expect(shedDecision('critical', at(100), T)).toBe('in_flight');
  });

  it('Авто: the concurrency limit sheds only once CPU is above the start (autoscaling first)', () => {
    const auto = { ...T, mode: 'auto' as const };
    const full = { ...calm, inFlight: 100, limit: 100 };
    expect(shedDecision('bulk', { ...full, cpuPct: 50 }, auto)).toBeNull();
    expect(shedDecision('bulk', { ...full, cpuPct: 76 }, auto)).toBe('cpu');
    expect(shedDecision('critical', { ...full, cpuPct: 76 }, auto)).toBe(
      'in_flight',
    );
    // Вкл applies the limit as set, CPU or not.
    expect(shedDecision('bulk', { ...full, cpuPct: 50 }, T)).toBe('in_flight');
  });
});
