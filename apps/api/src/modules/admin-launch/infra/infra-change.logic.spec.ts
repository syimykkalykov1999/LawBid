import { COST_REGISTRY } from '../../../common/ops/cost-registry';
import { switchFor } from '../../../common/ops/infra-switches';
import {
  INFRA_STATUSES,
  InfraTransitionError,
  canTransition,
  costDelta,
  createRefusal,
  dueTimeEvent,
  inQuietWindow,
  infraSuggestions,
  transition,
  type InfraEvent,
  type InfraStatus,
} from './infra-change.logic';

const entry = (id: string) => COST_REGISTRY.find((e) => e.id === id)!;

describe('infra change request state machine', () => {
  it('walks the happy path request → plan → confirm → apply → done → rolled back', () => {
    let s: InfraStatus = 'requested';
    for (const [ev, want] of [
      ['job_started', 'planning'],
      ['plan_ready', 'planned'],
      ['confirm', 'confirmed'],
      ['apply_started', 'applying'],
      ['apply_done', 'done'],
      ['rolled_back', 'rolled_back'],
    ] as [InfraEvent, InfraStatus][]) {
      s = transition(s, ev);
      expect(s).toBe(want);
    }
  });

  it('dry-run ends after the plan; a plan expires; the owner can cancel before apply', () => {
    expect(transition('planning', 'plan_ready_dry_run')).toBe('dry_run');
    expect(transition('planned', 'expire')).toBe('expired');
    expect(transition('planned', 'cancel')).toBe('cancelled');
    expect(transition('requested', 'dispatch_failed')).toBe('failed');
    expect(transition('planning', 'plan_failed')).toBe('failed');
    expect(transition('applying', 'apply_failed')).toBe('failed');
  });

  it('refuses every jump the diagram does not have', () => {
    // Nothing applies without a confirm; nothing leaves a final state.
    expect(() => transition('planned', 'apply_started')).toThrow(
      InfraTransitionError,
    );
    expect(() => transition('requested', 'confirm')).toThrow();
    expect(() => transition('applying', 'cancel')).toThrow();
    expect(() => transition('expired', 'confirm')).toThrow();
    for (const final of [
      'failed',
      'expired',
      'cancelled',
      'dry_run',
      'rolled_back',
    ] as InfraStatus[]) {
      for (const ev of [
        'confirm',
        'apply_started',
        'apply_done',
        'cancel',
        'job_started',
      ] as InfraEvent[]) {
        expect(canTransition(final, ev)).toBe(false);
      }
    }
    expect(INFRA_STATUSES).toHaveLength(11);
  });

  it('time limits: plan 30 min, start 60 min, apply 3 h', () => {
    const t0 = new Date('2026-10-26T10:00:00Z');
    const at = (min: number) => new Date(t0.getTime() + min * 60_000);
    const base = { createdAt: t0, plannedAt: t0, updatedAt: t0 };
    expect(dueTimeEvent({ ...base, status: 'planned' }, at(29))).toBeNull();
    expect(dueTimeEvent({ ...base, status: 'planned' }, at(31))).toBe('expire');
    expect(dueTimeEvent({ ...base, status: 'confirmed' }, at(31))).toBe(
      'expire',
    );
    expect(dueTimeEvent({ ...base, status: 'planning' }, at(59))).toBeNull();
    expect(dueTimeEvent({ ...base, status: 'requested' }, at(61))).toBe(
      'stale',
    );
    expect(dueTimeEvent({ ...base, status: 'applying' }, at(170))).toBeNull();
    expect(dueTimeEvent({ ...base, status: 'applying' }, at(181))).toBe(
      'stale',
    );
    expect(dueTimeEvent({ ...base, status: 'done' }, at(999))).toBeNull();
  });
});

describe('quiet hours', () => {
  // 2026-10-26 is CDT (UTC-5).
  const chicago = (hhmm: string) => new Date(`2026-10-26T${hhmm}:00-05:00`);
  it('empty = any time; a day window; a window over midnight', () => {
    expect(inQuietWindow('', chicago('15:00'))).toBe(true);
    expect(inQuietWindow('01:00-06:00', chicago('03:30'))).toBe(true);
    expect(inQuietWindow('01:00-06:00', chicago('06:00'))).toBe(false);
    expect(inQuietWindow('23:00-05:00', chicago('23:30'))).toBe(true);
    expect(inQuietWindow('23:00-05:00', chicago('04:59'))).toBe(true);
    expect(inQuietWindow('23:00-05:00', chicago('12:00'))).toBe(false);
  });
});

describe('cost delta from the registry', () => {
  it('Вкл adds the "if on" price, Выкл takes it away', () => {
    const os = entry('aws.opensearch');
    expect(costDelta(os, switchFor('aws.opensearch')!, 'off', 'on')).toEqual([
      28, 280,
    ]);
    expect(costDelta(os, switchFor('aws.opensearch')!, 'on', 'off')).toEqual([
      -280, -28,
    ]);
    const rep = entry('aws.rds_replicas');
    expect(costDelta(rep, switchFor('aws.rds_replicas')!, null, 'on')).toEqual([
      190, 190,
    ]);
  });

  it('a default-on row switched off saves its day-one price', () => {
    const waf = entry('aws.waf_alb');
    expect(costDelta(waf, switchFor('aws.waf_alb')!, 'on', 'off')).toEqual([
      -waf.usd.launch[1],
      -waf.usd.launch[0],
    ]);
  });
});

describe('create guards', () => {
  const base = {
    entry: entry('aws.opensearch'),
    sw: switchFor('aws.opensearch'),
    to: 'on',
    current: null,
    activeCount: 0,
    last24h: 0,
    dailyCap: 3,
    configured: true,
  };
  it('lets a normal request through', () => {
    expect(createRefusal(base)).toBeNull();
  });
  it('refuses: not whitelisted, wrong state, same state, busy, daily cap, not configured', () => {
    expect(
      createRefusal({ ...base, entry: entry('aws.backup'), sw: undefined }),
    ).toBe('unknown_item');
    expect(createRefusal({ ...base, to: 'auto' })).toBe('bad_state');
    expect(createRefusal({ ...base, current: 'on' })).toBe('same_state');
    expect(createRefusal({ ...base, activeCount: 1 })).toBe('busy');
    expect(createRefusal({ ...base, last24h: 3 })).toBe('daily_cap');
    expect(createRefusal({ ...base, configured: false })).toBe(
      'not_configured',
    );
  });
  it('OFF → ON needs a price in the registry', () => {
    const e = entry('aws.opensearch');
    expect(
      createRefusal({
        ...base,
        entry: { ...e, price: { ...e.price, text: '' } },
      }),
    ).toBe('no_price');
  });
});

describe('Авто for infra = suggestions only', () => {
  it('proposes from growth signals and never what is already there', () => {
    const live = (id: string) => (id === 'aws.macie' ? 'on' : 'off');
    const s = infraSuggestions(
      {
        pressures: ['db_connections', 'db_cpu'],
        budgetRatio: 0.95,
        searchEngine: 'shadow',
      },
      live,
    );
    expect(s.map((x) => `${x.id}:${x.to}`)).toEqual([
      'aws.pgbouncer:on',
      'aws.rds_replicas:on',
      'aws.opensearch:on',
      'aws.macie:off',
    ]);
    expect(
      infraSuggestions(
        { pressures: [], budgetRatio: 0.2, searchEngine: 'postgres' },
        live,
      ),
    ).toEqual([]);
  });
});
