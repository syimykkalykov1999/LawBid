import {
  buildSystemItems,
  countBySeverity,
  SEVERITY_ORDER,
  SYSTEM_FRESH_SEC,
  type SystemSignals,
} from './staff-system-items.logic';

const NOW = new Date('2026-10-27T10:00:00Z');

const quiet = (): SystemSignals => ({
  health: [],
  incidents: [],
  launch: [],
  cost: null,
  capacity: null,
  economyEvents: [],
  economyLimited: false,
  heavyPaused: false,
  scaleMode: null,
  workerAlive: true,
  backup: null,
  bloatOver: [],
  rotation: [],
});

describe('buildSystemItems (the owner «Система» block)', () => {
  it('a quiet system has nothing to do', () => {
    expect(buildSystemItems(quiet(), NOW)).toEqual([]);
  });

  it('the TTL is at least five minutes', () => {
    expect(SYSTEM_FRESH_SEC).toBeGreaterThanOrEqual(300);
  });

  it('orders by urgency, then by code, so the list is stable', () => {
    const s = quiet();
    s.launch = [
      {
        id: 'sign_required',
        status: 'manual',
        title: 'SIGN_REQUIRED',
        hint: null,
        manualTick: true,
        ticked: false,
      },
    ];
    s.heavyPaused = true; // low
    s.cost = { actualUsd: 90, forecastUsd: 90, limitUsd: 100 }; // medium
    s.capacity = {
      dbCpuPercent: 85,
      dbConnections: null,
      dbMaxConnections: null,
      redisMemoryPercent: 96, // critical
      dbNext: 'db.t4g.large',
    };
    s.incidents = [
      { component: 'database', openedAt: NOW.toISOString(), closedAt: null },
    ];
    const codes = buildSystemItems(s, NOW).map(
      (i) => `${i.severity}:${i.code}`,
    );
    expect(codes).toEqual([
      'critical:incident_database',
      'critical:redis_memory',
      'high:db_cpu',
      'medium:cost_80',
      'low:heavy_paused',
      'low:launch_sign_required',
    ]);
    const sev = buildSystemItems(s, NOW).map((i) => i.severity);
    const idx = sev.map((x) => SEVERITY_ORDER.indexOf(x));
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  });

  it('dedupes: an open incident hides the yellow light of the same part', () => {
    const s = quiet();
    s.incidents = [
      { component: 'redis', openedAt: NOW.toISOString(), closedAt: null },
      {
        component: 'redis',
        openedAt: NOW.toISOString(),
        closedAt: NOW.toISOString(),
      },
    ];
    s.health = [
      { key: 'redis', status: 'red' },
      { key: 'push', status: 'yellow' },
      { key: 'r2', status: 'green' },
      { key: 'turn', status: 'grey' },
    ];
    const items = buildSystemItems(s, NOW);
    expect(items.map((i) => i.code)).toEqual(['incident_redis', 'health_push']);
    expect(items[0].action).toEqual({
      kind: 'route',
      target: '/system-health',
      label: 'Открыть «Здоровье системы»',
    });
    expect(items[1].title).toContain('Пуш-уведомления');
  });

  it('closed incidents are gone; a ticked manual step is gone', () => {
    const s = quiet();
    s.incidents = [
      {
        component: 'queues',
        openedAt: NOW.toISOString(),
        closedAt: NOW.toISOString(),
      },
    ];
    s.launch = [
      {
        id: 'sign_required',
        status: 'green',
        title: 'x',
        hint: null,
        manualTick: true,
        ticked: true,
      },
      {
        id: 'dns',
        status: 'red',
        title: 'Домен в Cloudflare',
        hint: 'Перенесите NS.',
        manualTick: false,
        ticked: false,
      },
    ];
    const items = buildSystemItems(s, NOW);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      code: 'launch_dns',
      severity: 'high',
      why: 'Перенесите NS.',
      action: { kind: 'launch', target: 'dns' },
    });
  });

  it('money: over the ceiling is critical, forecast over is high, 80 % is medium', () => {
    const at = (actual: number, forecast: number | null) => {
      const s = quiet();
      s.cost = { actualUsd: actual, forecastUsd: forecast, limitUsd: 200 };
      return buildSystemItems(s, NOW).map((i) => `${i.severity}:${i.code}`);
    };
    expect(at(250, 300)).toEqual(['critical:cost_over']);
    expect(at(120, 260)).toEqual(['high:cost_forecast']);
    expect(at(170, 190)).toEqual(['medium:cost_80']);
    expect(at(50, 60)).toEqual([]);
    expect(
      buildSystemItems(
        { ...quiet(), cost: { actualUsd: 5, forecastUsd: null, limitUsd: 0 } },
        NOW,
      ),
    ).toEqual([]);
  });

  it('capacity: the biggest database size under load points at the split guide', () => {
    const s = quiet();
    s.capacity = {
      dbCpuPercent: 65,
      dbConnections: 90,
      dbMaxConnections: 100,
      redisMemoryPercent: 10,
      dbNext: null,
    };
    const items = buildSystemItems(s, NOW);
    expect(items.map((i) => i.code)).toEqual([
      'db_connections',
      'db_cpu',
      'db_split_ready',
    ]);
    expect(items.find((i) => i.code === 'db_split_ready')?.action).toEqual({
      kind: 'guide',
      target: 'db-split',
      label: 'Открыть инструкцию',
    });
    expect(items.find((i) => i.code === 'db_connections')?.action.target).toBe(
      'db-pooler',
    );
  });

  it('autoscale events count only the last 24 hours', () => {
    const s = quiet();
    s.economyEvents = [
      {
        at: '2026-10-27T08:00:00Z',
        kind: 'scaled_up',
        text: 'База: large → xlarge',
      },
      { at: '2026-10-20T08:00:00Z', kind: 'scaled_down', text: 'old' },
      { at: '2026-10-27T09:00:00Z', kind: 'guard_on', text: 'guard' },
    ];
    const items = buildSystemItems(s, NOW);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      code: 'autoscale_events',
      severity: 'low',
      title: 'Система сама меняла размер: 1 раз за сутки',
    });
    expect(items[0].why).toContain('large → xlarge');
  });

  it('worker, backup, bloat and rotation', () => {
    const s = quiet();
    s.workerAlive = false;
    s.backup = { ageHours: 60, maxHours: 26 };
    s.bloatOver = ['messages', 'notifications'];
    s.rotation = [
      { name: 'db', state: 'ok' },
      { name: 'redis', state: 'failed' },
      { name: 'jwt', state: 'overdue' },
    ];
    const items = buildSystemItems(s, NOW);
    expect(items.map((i) => `${i.severity}:${i.code}`)).toEqual([
      'critical:backup_old',
      'critical:worker_down',
      'high:rotation_failed',
      'low:db_bloat',
    ]);
    expect(items.find((i) => i.code === 'rotation_failed')?.why).toContain(
      'redis',
    );
    expect(countBySeverity(items)).toEqual({
      critical: 2,
      high: 1,
      medium: 0,
      low: 1,
    });
    // unknown heartbeat (nothing stored yet) is not an alarm
    expect(buildSystemItems({ ...quiet(), workerAlive: null }, NOW)).toEqual(
      [],
    );
  });
});

describe('«Сегодня»: duplicate subscriptions (algo audit M-4)', () => {
  it('held cases are a «today» item, auto-fixed ones a low note', () => {
    const s = quiet();
    s.billingDuplicates = {
      fixed: 2,
      refundedCents: 4_000,
      needsReview: 1,
      blocked: 0,
    };
    const items = buildSystemItems(s, NOW);
    expect(items.map((i) => [i.code, i.severity])).toEqual([
      ['billing_duplicates_review', 'high'],
      ['billing_duplicates_fixed', 'low'],
    ]);
    expect(items[0].action.target).toBe('/stripe-review');
  });

  it('nothing today, nothing on the list', () => {
    const s = quiet();
    s.billingDuplicates = {
      fixed: 0,
      refundedCents: 0,
      needsReview: 0,
      blocked: 0,
    };
    expect(buildSystemItems(s, NOW)).toEqual([]);
  });
});
