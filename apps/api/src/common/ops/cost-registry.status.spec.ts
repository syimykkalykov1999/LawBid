import { COST_REGISTRY, entryById } from './cost-registry';
import { computeRowStatus, type StatusSignals } from './cost-registry.status';

const NOW = new Date('2026-10-26T10:00:00Z');
const calm: StatusSignals = {
  workerAlive: true,
  heavyPaused: false,
  economyLimited: false,
  budgetRatio: 0.3,
  pressures: [],
  bunny: 'ok',
  cloudflare: 'ok',
  usageAgeHours: 5,
};
const st = (
  id: string,
  state: 'off' | 'on' | 'auto' | null,
  signals: Partial<StatusSignals> = {},
  extra: { known?: boolean; note?: string | null } = {},
) => {
  const entry = entryById(id);
  if (!entry) throw new Error(id);
  return computeRowStatus({
    entry,
    state,
    stateKnown: extra.known ?? true,
    stateNote: extra.note ?? null,
    signals: { ...calm, ...signals },
    now: NOW,
  });
};

describe('computeRowStatus (status dot)', () => {
  it('general rule: on = green, off = grey, auto without a signal = grey', () => {
    expect(st('aws.alb', 'on').live).toBe('active');
    expect(st('aws.opensearch', 'off').live).toBe('idle');
    expect(st('vendor.turnstile', 'auto').live).toBe('idle');
    expect(st('aws.alb', 'on').checkedAt).toBe(NOW.toISOString());
  });

  it('Авто with a live signal turns yellow with a reason', () => {
    const r = st('aws.db_autoscale', 'auto', { pressures: ['db_cpu'] });
    expect(r.live).toBe('attention');
    expect(r.reason).toContain('поднимет размер');
    expect(st('aws.db_autoscale', 'auto').live).toBe('idle');
    expect(
      st('aws.redis_autoscale', 'auto', { pressures: ['redis_memory'] }).live,
    ).toBe('attention');
    // a database pressure does not worry the Redis row
    expect(
      st('aws.redis_autoscale', 'auto', { pressures: ['db_cpu'] }).live,
    ).toBe('idle');
  });

  it('usage levels drive the Bunny and Cloudflare rows', () => {
    expect(st('vendor.bunny', 'auto', { bunny: 'crit' }).live).toBe(
      'attention',
    );
    expect(st('vendor.bunny', 'auto', { bunny: 'warn' }).live).toBe(
      'attention',
    );
    expect(st('vendor.bunny', 'auto').live).toBe('idle');
    expect(
      st('vendor.cloudflare_calls', 'auto', { cloudflare: 'crit' }).reason,
    ).toContain('Cloudflare');
    expect(st('vendor.bunny', 'on').live).toBe('attention'); // stopped by hand
    expect(st('vendor.bunny', 'off', { bunny: 'crit' }).reason).toContain(
      'выключена',
    );
  });

  it('economy, budget, worker and poll problems are yellow', () => {
    expect(st('hidden.economy_tick', 'on', { economyLimited: true }).live).toBe(
      'attention',
    );
    expect(
      st('aws.budgets_anomaly', 'on', { budgetRatio: 0.85 }).reason,
    ).toContain('85 %');
    expect(st('aws.budgets_anomaly', 'on').live).toBe('active');
    expect(st('hidden.cron_jobs', 'on', { workerAlive: false }).live).toBe(
      'attention',
    );
    expect(st('hidden.cron_jobs', 'on', { heavyPaused: true }).live).toBe(
      'attention',
    );
    expect(st('hidden.cron_jobs', 'on').live).toBe('active');
    expect(st('hidden.usage_poll', 'on', { usageAgeHours: null }).live).toBe(
      'attention',
    );
    expect(st('hidden.usage_poll', 'on', { usageAgeHours: 40 }).live).toBe(
      'attention',
    );
    expect(st('hidden.usage_poll', 'on').live).toBe('active');
  });

  it('an unreadable switch or a hand-set value needs attention', () => {
    expect(
      st(
        'aws.db_autoscale',
        null,
        {},
        { known: false, note: 'AWS не ответил.' },
      ).live,
    ).toBe('attention');
    expect(
      st(
        'vendor.twilio',
        'auto',
        {},
        { known: false, note: 'своё значение 400' },
      ).live,
    ).toBe('attention');
  });

  it('every registry row gets a status with a one-phrase reason', () => {
    for (const e of COST_REGISTRY) {
      const r = computeRowStatus({
        entry: e,
        state: e.defaultState,
        stateKnown: true,
        stateNote: null,
        signals: calm,
        now: NOW,
      });
      expect(['active', 'idle', 'attention']).toContain(r.live);
      expect(r.reason.length).toBeGreaterThan(5);
    }
  });
});
