import {
  autoApplyOk,
  autoRefusal,
  autoWants,
  dueWants,
  type AutoSignals,
  type AutoWant,
} from './infra-auto.logic';

const calm: AutoSignals = {
  pressures: [],
  budgetRatio: 0.2,
  searchEngine: 'postgres',
  partitionNeedsRunner: false,
};
const offAll = () => 'off' as const;
const MIN = 60_000;
const H = 3_600_000;

describe('autoWants', () => {
  it('nothing when calm', () => {
    expect(autoWants(calm, offAll, new Set())).toEqual([]);
  });

  it('signals become switch-ons', () => {
    const w = autoWants(
      {
        ...calm,
        pressures: ['db_connections', 'db_cpu'],
        searchEngine: 'shadow',
        partitionNeedsRunner: true,
      },
      offAll,
      new Set(),
    );
    expect(w.map((x) => `${x.id}:${x.to}`).sort()).toEqual([
      'aws.opensearch:on',
      'aws.partition_role:on',
      'aws.pgbouncer:on',
      'aws.rds_replicas:on',
    ]);
  });

  it('switches off only what it switched on itself, once the signal is gone', () => {
    const on = () => 'on' as const;
    expect(autoWants(calm, on, new Set())).toEqual([]);
    const w = autoWants(
      calm,
      on,
      new Set(['aws.pgbouncer', 'aws.partition_role']),
    );
    expect(w.map((x) => `${x.id}:${x.to}`)).toEqual(['aws.pgbouncer:off']);
    // signal back: stays on
    expect(
      autoWants(
        { ...calm, pressures: ['db_connections'] },
        on,
        new Set(['aws.pgbouncer']),
      ),
    ).toEqual([]);
  });

  it('a small direct pool switches the pooler on, and keeps it on', () => {
    expect(
      autoWants({ ...calm, poolSmall: true }, offAll, new Set()).map(
        (x) => `${x.id}:${x.to}`,
      ),
    ).toEqual(['aws.pgbouncer:on']);
    const on = () => 'on' as const;
    expect(
      autoWants({ ...calm, poolSmall: true }, on, new Set(['aws.pgbouncer'])),
    ).toEqual([]);
  });

  it('over budget: security / monitoring are never switched off by itself', () => {
    const on = () => 'on' as const;
    expect(autoWants({ ...calm, budgetRatio: 0.95 }, on, new Set())).toEqual(
      [],
    );
  });
});

describe('dueWants (hysteresis)', () => {
  const on: AutoWant = { id: 'aws.pgbouncer', to: 'on', reason: '' };
  const off: AutoWant = { id: 'aws.pgbouncer', to: 'off', reason: '' };

  it('a switch-on acts only after the signal held onMs', () => {
    let seen = {};
    let r = dueWants([on], seen, 0, 30 * MIN, 72 * H);
    expect(r.due).toEqual([]);
    seen = r.seen;
    r = dueWants([on], seen, 29 * MIN, 30 * MIN, 72 * H);
    expect(r.due).toEqual([]);
    r = dueWants([on], r.seen, 30 * MIN, 30 * MIN, 72 * H);
    expect(r.due).toEqual([on]);
  });

  it('a gap forgets the start (a flapping signal never acts)', () => {
    let r = dueWants([on], {}, 0, 30 * MIN, 72 * H);
    r = dueWants([], r.seen, 10 * MIN, 30 * MIN, 72 * H);
    expect(r.seen).toEqual({});
    r = dueWants([on], r.seen, 20 * MIN, 30 * MIN, 72 * H);
    r = dueWants([on], r.seen, 45 * MIN, 30 * MIN, 72 * H);
    expect(r.due).toEqual([]);
  });

  it('a switch-off waits offMs', () => {
    let r = dueWants([off], {}, 0, 30 * MIN, 72 * H);
    r = dueWants([off], r.seen, 71 * H, 30 * MIN, 72 * H);
    expect(r.due).toEqual([]);
    r = dueWants([off], r.seen, 72 * H, 30 * MIN, 72 * H);
    expect(r.due).toEqual([off]);
  });
});

describe('autoRefusal', () => {
  const base = {
    mode: 'auto',
    want: { id: 'aws.pgbouncer', to: 'on' as const, reason: '' },
    configured: true,
    inQuietWindow: true,
    activeCount: 0,
    last24h: 0,
    dailyCap: 3,
    budgetRatio: 0.3,
    costHighUsd: 70,
    maxUsdMonth: 100,
  };
  it('goes when everything allows', () => {
    expect(autoRefusal(base)).toBeNull();
  });
  it('mode, setup, busy, cap, quiet hours', () => {
    expect(autoRefusal({ ...base, mode: 'off' })).toBe('auto_off');
    expect(autoRefusal({ ...base, configured: false })).toBe('not_configured');
    expect(autoRefusal({ ...base, activeCount: 1 })).toBe('busy');
    expect(autoRefusal({ ...base, last24h: 3 })).toBe('daily_cap');
    expect(autoRefusal({ ...base, inQuietWindow: false })).toBe('quiet_hours');
  });
  it('money ceiling holds back switch-ons, never switch-offs', () => {
    expect(autoRefusal({ ...base, budgetRatio: 0.9 })).toBe('money_budget');
    expect(autoRefusal({ ...base, costHighUsd: 101 })).toBe('money_item');
    expect(
      autoRefusal({
        ...base,
        want: { ...base.want, to: 'off' },
        budgetRatio: 0.99,
        costHighUsd: 1000,
      }),
    ).toBeNull();
  });
});

describe('autoApplyOk', () => {
  const td = 'module.stack.module.ecs.aws_ecs_task_definition.worker';
  it('switch-on: creates and task-definition replacements only', () => {
    expect(
      autoApplyOk('on', [
        { address: 'x.aws_db_instance.r[0]', action: 'create' },
      ]),
    ).toBe(true);
    expect(autoApplyOk('on', [{ address: td, action: 'delete-create' }])).toBe(
      true,
    );
    expect(
      autoApplyOk('on', [
        { address: 'x.aws_cloudwatch_metric_alarm.a', action: 'delete' },
      ]),
    ).toBe(false);
  });
  it('switch-off: deletes and task-definition replacements only', () => {
    expect(
      autoApplyOk('off', [
        { address: 'x.aws_db_instance.r[0]', action: 'delete' },
      ]),
    ).toBe(true);
    expect(autoApplyOk('off', [{ address: td, action: 'create-delete' }])).toBe(
      true,
    );
    expect(
      autoApplyOk('off', [{ address: 'x.aws_lb.n', action: 'create' }]),
    ).toBe(false);
  });
});
