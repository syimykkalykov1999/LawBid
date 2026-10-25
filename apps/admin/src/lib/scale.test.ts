import { describe, expect, it } from 'vitest';
import {
  autoscaleWord,
  buildAlarms,
  ladder,
  parseCeiling,
  poolerLine,
  searchLine,
  usageLine,
  type Economy,
  type Health,
  type ScaleExtras,
} from './scale';

const NOW = Date.parse('2026-10-24T12:00:00Z');

function health(over: Partial<Health> = {}): Health {
  return {
    overall: 'green',
    generatedAt: '2026-10-24T12:00:00Z',
    items: [],
    incidents: [],
    heavyPause: null,
    scaleMode: null,
    actions: { onAws: true, budget: true },
    settings: { autoPauseHeavyJobs: true, autoScaleDownOnBudget: true, dbSlowMs: 800, backupMaxAgeHours: 30 },
    ...over,
  } as Health;
}

function economy(over: Record<string, unknown> = {}): Economy {
  return {
    enabled: true,
    guard: 'ok',
    since: null,
    events: [],
    capacity: { onAws: true, dbNext: 'db.t4g.large', redisNext: 'cache.t4g.small', dbTiers: [], redisTiers: [] },
    ...over,
  } as unknown as Economy;
}

const tiers = (cur: number) =>
  ['a', 'b', 'c'].map((name, i) => ({ name, memoryGb: i + 1, monthUsd: 10 * (i + 1), current: i === cur }));

describe('ladder', () => {
  it('says where on the ladder the class is, with both neighbours', () => {
    const l = ladder(tiers(1));
    expect(l.position).toBe('ступень 2 из 3');
    expect(l.prev?.name).toBe('a');
    expect(l.next?.name).toBe('c');
  });
  it('has no down step at the bottom and no up step at the top', () => {
    expect(ladder(tiers(0)).prev).toBeNull();
    expect(ladder(tiers(2)).next).toBeNull();
  });
  it('is empty when the current class is unknown', () => {
    expect(ladder(tiers(-1))).toEqual({ position: null, current: null, next: null, prev: null });
  });
});

describe('small words', () => {
  it('words the autoscale switch', () => {
    expect(autoscaleWord('on').tone).toBe('success');
    expect(autoscaleWord('off').label).toContain('вы');
    expect(autoscaleWord(undefined).label).toContain('неизвестен');
  });

  it('accepts only whole ceilings between 1 and the Terraform cap', () => {
    expect(parseCeiling('12', 50)).toBe(12);
    expect(parseCeiling(' 50 ', 50)).toBe(50);
    expect(parseCeiling('51', 50)).toBeNull();
    expect(parseCeiling('0', 50)).toBeNull();
    expect(parseCeiling('2.5', 50)).toBeNull();
    expect(parseCeiling('', 50)).toBeNull();
  });

  it('words the pooler and the search engine', () => {
    const off = { poolerEnabled: false } as ScaleExtras;
    expect(poolerLine(off).label).toBe('Выключен');
    const on = { poolerEnabled: true, poolerMinTasks: 1, poolerMaxTasks: 4 } as ScaleExtras;
    expect(poolerLine(on).line).toContain('от 1 до 4');
    expect(searchLine('postgres')).toContain('PostgreSQL');
    expect(searchLine('opensearch')).toBe('OpenSearch');
    expect(searchLine('x')).toBe('x');
  });
});

describe('usageLine degrades gracefully', () => {
  it('says "no data yet" while batch C is not merged (item absent)', () => {
    expect(usageLine(health().items, 'cloudflare_usage').line).toContain('Данных пока нет');
    expect(usageLine(undefined, 'bunny_usage').tone).toBe('neutral');
  });
  it('reads the snapshot numbers', () => {
    const items = [
      { key: 'cloudflare_usage', status: 'yellow', detail: { egressGb: 720 } },
      { key: 'bunny_usage', status: 'green', detail: { bandwidthGb: 12, storageGb: 3 } },
    ] as never;
    expect(usageLine(items, 'cloudflare_usage')).toMatchObject({ tone: 'warning' });
    expect(usageLine(items, 'cloudflare_usage').line).toContain('720');
    expect(usageLine(items, 'bunny_usage').line).toContain('12 ГБ');
  });
  it('shows grey and error states', () => {
    const grey = [{ key: 'bunny_usage', status: 'grey', detail: {} }] as never;
    expect(usageLine(grey, 'bunny_usage').line).toContain('Не подключено');
    const err = [{ key: 'bunny_usage', status: 'yellow', detail: { error: 'HTTP 401' } }] as never;
    expect(usageLine(err, 'bunny_usage').line).toContain('HTTP 401');
  });
});

describe('buildAlarms', () => {
  it('is empty when everything is fine', () => {
    expect(buildAlarms(health(), economy(), NOW)).toEqual([]);
  });

  it('turns an open incident into what / auto / button', () => {
    const h = health({
      items: [{ key: 'worker', status: 'red', detail: { lastBeatSec: null } }] as Health['items'],
      incidents: [
        { id: 'i1', component: 'worker', openedAt: '2026-10-24T11:50:00Z', closedAt: null, detail: {} },
      ],
    });
    const [a] = buildAlarms(h, economy(), NOW);
    expect(a.tone).toBe('danger');
    expect(a.title).toBe('Фоновые задачи');
    expect(a.what).toContain('не отзывается');
    expect(a.auto.join(' ')).toContain('AWS сам запускает');
    expect(a.action?.action).toEqual({ kind: 'restart' });
    expect(a.span).toContain('идёт 10 мин');
  });

  it('ignores closed incidents and does not repeat a component', () => {
    const h = health({
      items: [{ key: 'redis', status: 'red', detail: { error: 'x' } }] as Health['items'],
      incidents: [
        { id: 'a', component: 'redis', openedAt: '2026-10-24T11:00:00Z', closedAt: '2026-10-24T11:05:00Z', detail: {} },
        { id: 'b', component: 'redis', openedAt: '2026-10-24T11:30:00Z', closedAt: null, detail: {} },
      ],
    });
    const alarms = buildAlarms(h, economy(), NOW);
    expect(alarms).toHaveLength(1);
    expect(alarms[0].id).toBe('incident:b');
    expect(alarms[0].action?.action).toEqual({ kind: 'increase', target: 'redis' });
  });

  it('shows a yellow light that has no incident, red first', () => {
    const h = health({
      items: [
        { key: 'database', status: 'yellow', detail: { latencyMs: 900, slowMs: 800 } },
        { key: 'queues', status: 'red', detail: { waiting: 5, oldestSec: 400, dlq: 0 } },
      ] as Health['items'],
      heavyPause: { by: 'auto', at: '2026-10-24T11:58:00Z', reason: 'slow db' },
    });
    const alarms = buildAlarms(h, economy(), NOW);
    expect(alarms.map((a) => a.component)).toEqual(['queues', 'database']);
    const db = alarms[1];
    expect(db.auto.join(' ')).toContain('поставлены на паузу системой');
    // Already paused: the next recommended step is a bigger database.
    expect(db.action?.action).toEqual({ kind: 'increase', target: 'db' });
  });

  it('offers the pause first when heavy jobs still run', () => {
    const h = health({ items: [{ key: 'database', status: 'yellow', detail: { latencyMs: 900 } }] as Health['items'] });
    expect(buildAlarms(h, economy(), NOW)[0].action?.action).toEqual({ kind: 'pause', paused: true });
  });

  it('lists the automatic resize from the economy events of the last day only', () => {
    const e = economy({
      events: [
        { at: '2026-10-24T10:00:00Z', kind: 'scaled_up', text: 'База данных: db.t4g.small → db.t4g.medium (само)' },
        { at: '2026-10-24T10:01:00Z', kind: 'scaled_up', text: 'Redis: a → b' },
        { at: '2026-10-20T10:00:00Z', kind: 'db_cpu', text: 'старое' },
      ],
    });
    const h = health({ items: [{ key: 'database', status: 'red', detail: { error: 'x' } }] as Health['items'] });
    const auto = buildAlarms(h, e, NOW)[0].auto;
    expect(auto).toEqual(['База данных: db.t4g.small → db.t4g.medium (само)']);
  });

  it('gives no button when not on AWS or when no API fits', () => {
    const h = health({
      actions: { onAws: false, budget: false },
      items: [
        { key: 'worker', status: 'red', detail: {} },
        { key: 'push', status: 'yellow', detail: { ok: 1, failed: 9 } },
      ] as Health['items'],
    });
    for (const a of buildAlarms(h, economy({ capacity: { onAws: false } }), NOW)) expect(a.action).toBeNull();
  });

  it('adds the economy guard card and swaps the cost button to "normal" when on minimum', () => {
    const limited = economy({ guard: 'limited' });
    expect(buildAlarms(health(), limited, NOW)[0].id).toBe('economy:limited');
    const h = health({
      scaleMode: { mode: 'min', by: 'auto', at: '2026-10-24T09:00:00Z' },
      items: [{ key: 'cost', status: 'red', detail: { actualUsd: 500, limitUsd: 500, forecastUsd: 700 } }] as Health['items'],
    });
    const [a] = buildAlarms(h, economy({ guard: 'limited' }), NOW);
    expect(a.id).toBe('item:cost');
    expect(a.action?.action).toEqual({ kind: 'scale', mode: 'normal' });
    expect(a.auto.join(' ')).toContain('удержан на минимуме');
  });
});
