import {
  autoApplyOk,
  autoRefusal,
  autoWants,
  dueWants,
  SEARCH_ENGINE_OFF_PEOPLE,
  SEARCH_ENGINE_ON_PEOPLE,
  type AutoSignals,
  type AutoWant,
} from './infra-auto.logic';
import { COST_REGISTRY } from '../../../common/ops/cost-registry';
import { switchFor } from '../../../common/ops/infra-switches';
import { costDelta } from './infra-change.logic';

const calm: AutoSignals = {
  pressures: [],
  budgetRatio: 0.2,
  searchEngine: 'postgres',
  partitionNeedsRunner: false,
};
const offAll = () => 'off' as const;
const MIN = 60_000;
const H = 3_600_000;

describe('autoWants G4–G6 (2026-11-08)', () => {
  const ids = (w: AutoWant[]) => w.map((x) => `${x.id}:${x.to}`).sort();

  it('G4: events.sink wants the stream and there is none → on; gone → off (only if auto)', () => {
    expect(
      ids(autoWants({ ...calm, eventsStreamWanted: true }, offAll, new Set())),
    ).toEqual(['aws.events_stream:on']);
    const onLive = (id: string) => (id === 'aws.events_stream' ? 'on' : 'off');
    expect(
      ids(autoWants(calm, onLive, new Set(['aws.events_stream']))),
    ).toEqual(['aws.events_stream:off']);
    // switched on by hand: stays
    expect(autoWants(calm, onLive, new Set())).toEqual([]);
  });

  it('G5: cache node on Redis memory pressure (Авто) or Вкл; never by Выкл; never off by itself', () => {
    const tight = { ...calm, pressures: ['redis_memory'] };
    expect(
      ids(autoWants({ ...tight, cacheRedisMode: 'auto' }, offAll, new Set())),
    ).toEqual(['aws.redis_cache:on']);
    expect(
      ids(autoWants({ ...calm, cacheRedisMode: 'on' }, offAll, new Set())),
    ).toEqual(['aws.redis_cache:on']);
    expect(
      autoWants({ ...tight, cacheRedisMode: 'off' }, offAll, new Set()),
    ).toEqual([]);
    expect(
      autoWants({ ...tight, cacheNodeLive: true }, offAll, new Set()),
    ).toEqual([]);
    const onLive = (id: string) => (id === 'aws.redis_cache' ? 'on' : 'off');
    expect(autoWants(calm, onLive, new Set(['aws.redis_cache']))).toEqual([]);
  });

  it('G6: db.replica_provision rules the pipeline replica; the app path wins when it has IAM', () => {
    const busy = { ...calm, pressures: ['db_cpu'] };
    expect(ids(autoWants(busy, offAll, new Set()))).toEqual([
      'aws.rds_replicas:on',
    ]);
    expect(
      autoWants({ ...busy, replicaProvision: 'off' }, offAll, new Set()),
    ).toEqual([]);
    expect(
      autoWants({ ...busy, replicaAppPath: true }, offAll, new Set()),
    ).toEqual([]);
  });
});

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

  it('the search line comes from infra.search_engine_on_people (lowered for a check, then back)', () => {
    const ids = (w: AutoWant[]) => w.map((x) => `${x.id}:${x.to}`);
    expect(
      ids(
        autoWants(
          { ...calm, people: 10, searchOnPeople: 10 },
          offAll,
          new Set(),
        ),
      ),
    ).toEqual(['aws.opensearch:on']);
    expect(
      ids(
        autoWants(
          { ...calm, people: 9, searchOnPeople: 10 },
          offAll,
          new Set(),
        ),
      ),
    ).toEqual([]);
    // the one switched on by itself goes off below 80 % of the line
    // One search node (the extra node steps are off, owner 2026-11-12).
    const onAll = (id: string): 'on' | 'off' =>
      id.startsWith('aws.opensearch_nodes') ? 'off' : 'on';
    const mine = new Set(['aws.opensearch']);
    expect(
      ids(autoWants({ ...calm, people: 7, searchOnPeople: 10 }, onAll, mine)),
    ).toContain('aws.opensearch:off');
    expect(
      ids(
        autoWants({ ...calm, people: 8, searchOnPeople: 10 }, onAll, mine),
      ).filter((x) => x.startsWith('aws.opensearch')),
    ).toEqual([]);
  });

  it('5M people switch the search engine on; it goes off again only below 4M (perf guard 2026-11-08)', () => {
    const ids = (w: AutoWant[]) => w.map((x) => `${x.id}:${x.to}`);
    expect(
      ids(
        autoWants(
          { ...calm, people: SEARCH_ENGINE_ON_PEOPLE - 1 },
          offAll,
          new Set(),
        ),
      ),
    ).toEqual([]);
    expect(
      ids(
        autoWants(
          { ...calm, people: SEARCH_ENGINE_ON_PEOPLE },
          offAll,
          new Set(),
        ),
      ),
    ).toEqual(['aws.opensearch:on']);
    // One search node (the extra node steps are off, owner 2026-11-12).
    const onAll = (id: string): 'on' | 'off' =>
      id.startsWith('aws.opensearch_nodes') ? 'off' : 'on';
    const mine = new Set(['aws.opensearch']);
    // between the two lines: stays on, nothing to do
    expect(
      ids(
        autoWants(
          { ...calm, people: SEARCH_ENGINE_OFF_PEOPLE + 1 },
          onAll,
          mine,
        ),
      ).filter((x) => x.startsWith('aws.opensearch')),
    ).toEqual([]);
    // below the lower line: the one it switched on itself goes off
    expect(
      ids(
        autoWants(
          { ...calm, people: SEARCH_ENGINE_OFF_PEOPLE - 1 },
          onAll,
          mine,
        ),
      ).filter((x) => x.startsWith('aws.opensearch')),
    ).toEqual(['aws.opensearch:off']);
    // switched on by hand: never switched off by itself
    expect(
      ids(autoWants({ ...calm, people: 0 }, onAll, new Set())).filter((x) =>
        x.startsWith('aws.opensearch'),
      ),
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

describe('autoWants: second database server (db.shards_mode, 2026-11-11)', () => {
  const ids = (w: AutoWant[]) => w.map((x) => `${x.id}:${x.to}`).sort();
  const has = (w: AutoWant[]) => ids(w).includes('aws.db_shards:on');

  it('Авто: on from 80 % of the split threshold (yellow / red), not while green', () => {
    expect(
      has(autoWants({ ...calm, shardGrowth: 'yellow' }, offAll, new Set())),
    ).toBe(true);
    expect(
      has(autoWants({ ...calm, shardGrowth: 'red' }, offAll, new Set())),
    ).toBe(true);
    expect(
      has(autoWants({ ...calm, shardGrowth: 'green' }, offAll, new Set())),
    ).toBe(false);
    expect(has(autoWants(calm, offAll, new Set()))).toBe(false);
  });

  it('Авто: on by CPU only when the read copy and the pooler already run', () => {
    const hot = { ...calm, pressures: ['db_cpu'] };
    expect(has(autoWants(hot, offAll, new Set()))).toBe(false);
    const both = (id: string) =>
      id === 'aws.rds_replicas' || id === 'aws.pgbouncer'
        ? ('on' as const)
        : ('off' as const);
    expect(has(autoWants(hot, both, new Set()))).toBe(true);
  });

  it('Вкл: on at once; Выкл: never; already on: nothing; never off by itself', () => {
    expect(
      has(autoWants({ ...calm, shardsMode: 'on' }, offAll, new Set())),
    ).toBe(true);
    expect(
      has(
        autoWants(
          { ...calm, shardsMode: 'off', shardGrowth: 'red' },
          offAll,
          new Set(),
        ),
      ),
    ).toBe(false);
    const live = (id: string) =>
      id === 'aws.db_shards' ? ('on' as const) : ('off' as const);
    expect(
      ids(
        autoWants(
          { ...calm, shardGrowth: 'green' },
          live,
          new Set(['aws.db_shards']),
        ),
      ),
    ).toEqual([]);
  });
});

// Owner 2026-11-11: Выкл / Вкл / Авто on «Масштаб» really rule each item.
describe('autoWants: the position picked per item (infra-modes)', () => {
  const ids = (w: AutoWant[]) => w.map((x) => `${x.id}:${x.to}`).sort();
  const busy: AutoSignals = { ...calm, pressures: ['db_cpu'] };
  const replicaOn = (id: string) =>
    id === 'aws.rds_replicas' ? ('on' as const) : ('off' as const);

  it('Выкл: never switched on by itself, whatever the load', () => {
    expect(
      autoWants(
        { ...busy, modes: { 'aws.rds_replicas': 'off' } },
        offAll,
        new Set(),
      ),
    ).toEqual([]);
  });

  it('Вкл: switched on when it is off, and never switched off by itself', () => {
    expect(
      ids(
        autoWants(
          { ...calm, modes: { 'aws.pgbouncer': 'on' } },
          offAll,
          new Set(),
        ),
      ),
    ).toEqual(['aws.pgbouncer:on']);
    expect(
      autoWants(
        { ...calm, modes: { 'aws.rds_replicas': 'on' } },
        replicaOn,
        new Set(['aws.rds_replicas']),
      ),
    ).toEqual([]);
  });

  it('Авто picked by hand: an item switched on by hand goes off when not needed', () => {
    expect(
      ids(
        autoWants(
          {
            ...calm,
            modes: { 'aws.rds_replicas': 'auto' },
            pickedAuto: new Set(['aws.rds_replicas']),
          },
          replicaOn,
          new Set(),
        ),
      ),
    ).toEqual(['aws.rds_replicas:off']);
    // Авто by default only: what was switched on by hand stays.
    expect(autoWants(calm, replicaOn, new Set())).toEqual([]);
  });

  it('Авто: on under load, as before', () => {
    expect(
      ids(
        autoWants(
          { ...busy, modes: { 'aws.rds_replicas': 'auto' } },
          offAll,
          new Set(),
        ),
      ),
    ).toEqual(['aws.rds_replicas:on']);
  });
});

// Owner 2026-11-11: the third and fourth database servers on «Авто».
describe('autoWants: the next database server', () => {
  const ids = (w: AutoWant[]) => w.map((x) => `${x.id}:${x.to}`).sort();
  const liveOf =
    (on: string[]) =>
    (id: string): 'on' | 'off' =>
      on.includes(id) ? 'on' : 'off';

  it('servers full and the second is on → the third, not the fourth', () => {
    expect(
      ids(
        autoWants(
          { ...calm, serversFull: true },
          liveOf(['aws.db_shards', 'aws.rds_replicas', 'aws.pgbouncer']),
          new Set(),
        ),
      ).filter((x) => x.startsWith('aws.db_shards')),
    ).toEqual(['aws.db_shards_2:on']);
  });

  it('the fourth only after the third', () => {
    expect(
      ids(
        autoWants(
          { ...calm, serversFull: true },
          liveOf(['aws.db_shards', 'aws.db_shards_2']),
          new Set(),
        ),
      ).filter((x) => x.startsWith('aws.db_shards')),
    ).toEqual(['aws.db_shards_3:on']);
  });

  it('nothing while some server is still empty or no server is near', () => {
    expect(
      autoWants(
        { ...calm, serversFull: false },
        liveOf(['aws.db_shards']),
        new Set(),
      ).filter((x) => x.id.startsWith('aws.db_shards')),
    ).toEqual([]);
  });

  it('Выкл on the third: never by itself; Вкл: only after the second', () => {
    expect(
      autoWants(
        {
          ...calm,
          serversFull: true,
          modes: { 'aws.db_shards_2': 'off' },
        },
        liveOf(['aws.db_shards']),
        new Set(),
      ).filter((x) => x.id.startsWith('aws.db_shards')),
    ).toEqual([]);
    expect(
      autoWants(
        { ...calm, modes: { 'aws.db_shards_2': 'on' } },
        offAll,
        new Set(),
      ).filter((x) => x.id === 'aws.db_shards_2'),
    ).toEqual([]);
  });

  // Owner 2026-11-12: «Авто» both ways — only an EMPTY extra server goes.
  const servers = (w: AutoWant[]) =>
    ids(w).filter((x) => x.startsWith('aws.db_shards'));

  it('the last extra server goes when it is empty and not needed', () => {
    expect(
      servers(
        autoWants(
          { ...calm, emptyServers: ['db2'] },
          liveOf(['aws.db_shards', 'aws.db_shards_2']),
          new Set(),
        ),
      ),
    ).toEqual(['aws.db_shards_2:off']);
    expect(
      servers(
        autoWants(
          { ...calm, emptyServers: ['db1'] },
          liveOf(['aws.db_shards']),
          new Set(),
        ),
      ),
    ).toEqual(['aws.db_shards:off']);
  });

  it('a server with data, a lower empty one, or growth near: stays', () => {
    // db2 holds data: nothing goes (db1 below it is not the last one).
    expect(
      servers(
        autoWants(
          { ...calm, emptyServers: ['db1'] },
          liveOf(['aws.db_shards', 'aws.db_shards_2']),
          new Set(),
        ),
      ),
    ).toEqual([]);
    // Some server nears the split threshold: the empty one takes the split.
    expect(
      servers(
        autoWants(
          { ...calm, emptyServers: ['db1'], shardGrowth: 'yellow' },
          liveOf(['aws.db_shards']),
          new Set(),
        ),
      ),
    ).toEqual([]);
    // Unknown emptiness (signal missing) = never.
    expect(
      servers(autoWants(calm, liveOf(['aws.db_shards']), new Set())),
    ).toEqual([]);
  });

  it('Вкл or db.shards_mode = Вкл keeps an empty server', () => {
    expect(
      servers(
        autoWants(
          {
            ...calm,
            emptyServers: ['db1'],
            modes: { 'aws.db_shards': 'on' },
          },
          liveOf(['aws.db_shards']),
          new Set(),
        ),
      ),
    ).toEqual([]);
    expect(
      servers(
        autoWants(
          { ...calm, emptyServers: ['db1'], shardsMode: 'on' },
          liveOf(['aws.db_shards']),
          new Set(),
        ),
      ),
    ).toEqual([]);
  });
});

// Owner 2026-11-11: read copies 2..5 «Авто» by count (Aurora Auto Scaling).
describe('autoWants: read copies by count', () => {
  const ids = (w: AutoWant[]) =>
    w
      .map((x) => `${x.id}:${x.to}`)
      .filter((x) => x.startsWith('aws.rds_replicas'))
      .sort();
  const liveOf =
    (on: string[]) =>
    (id: string): 'on' | 'off' =>
      on.includes(id) ? 'on' : 'off';

  it('copies busy → one more copy (the next one only)', () => {
    expect(
      ids(
        autoWants(
          { ...calm, pressures: ['replica_cpu'] },
          liveOf(['aws.rds_replicas']),
          new Set(),
        ),
      ),
    ).toEqual(['aws.rds_replicas_2:on']);
    expect(
      ids(
        autoWants(
          { ...calm, pressures: ['replica_cpu'] },
          liveOf(['aws.rds_replicas', 'aws.rds_replicas_2']),
          new Set(),
        ),
      ),
    ).toEqual(['aws.rds_replicas_3:on']);
  });

  it('copies idle → the highest extra copy goes, never two at once', () => {
    expect(
      ids(
        autoWants(
          { ...calm, pressures: ['replica_idle'] },
          liveOf([
            'aws.rds_replicas',
            'aws.rds_replicas_2',
            'aws.rds_replicas_3',
          ]),
          new Set(['aws.rds_replicas']),
        ),
      ),
    ).toEqual(['aws.rds_replicas_3:off']);
  });

  it('the first copy does not go while an extra one is on', () => {
    expect(
      ids(
        autoWants(
          { ...calm, pressures: [] },
          liveOf(['aws.rds_replicas', 'aws.rds_replicas_2']),
          new Set(['aws.rds_replicas']),
        ),
      ),
    ).toEqual([]);
  });

  it('Выкл on an extra copy: never by itself; no copy at all → nothing', () => {
    expect(
      ids(
        autoWants(
          {
            ...calm,
            pressures: ['replica_cpu'],
            modes: { 'aws.rds_replicas_2': 'off' },
          },
          liveOf(['aws.rds_replicas']),
          new Set(),
        ),
      ),
    ).toEqual([]);
    expect(
      ids(
        autoWants({ ...calm, pressures: ['replica_cpu'] }, offAll, new Set()),
      ),
    ).toEqual([]);
  });
});

// Owner 2026-11-12: search engine nodes 1→2→4 «Авто» by count.
describe('autoWants: search engine nodes by count', () => {
  const ids = (w: AutoWant[]) =>
    w
      .map((x) => `${x.id}:${x.to}`)
      .filter((x) => x.startsWith('aws.opensearch'))
      .sort();
  const liveOf =
    (on: string[]) =>
    (id: string): 'on' | 'off' =>
      on.includes(id) ? 'on' : 'off';

  it('engine busy → the next step only', () => {
    expect(
      ids(
        autoWants(
          { ...calm, pressures: ['search_busy'] },
          liveOf(['aws.opensearch']),
          new Set(),
        ),
      ),
    ).toEqual(['aws.opensearch_nodes_2:on']);
    expect(
      ids(
        autoWants(
          { ...calm, pressures: ['search_busy'] },
          liveOf(['aws.opensearch', 'aws.opensearch_nodes_2']),
          new Set(),
        ),
      ),
    ).toEqual(['aws.opensearch_nodes_4:on']);
    expect(
      ids(
        autoWants(
          { ...calm, pressures: ['search_busy'] },
          liveOf([
            'aws.opensearch',
            'aws.opensearch_nodes_2',
            'aws.opensearch_nodes_4',
          ]),
          new Set(),
        ),
      ),
    ).toEqual([]);
  });

  it('engine idle → the highest step goes, never two at once', () => {
    expect(
      ids(
        autoWants(
          { ...calm, pressures: ['search_idle'], searchEngine: 'engine' },
          liveOf([
            'aws.opensearch',
            'aws.opensearch_nodes_2',
            'aws.opensearch_nodes_4',
          ]),
          new Set(['aws.opensearch']),
        ),
      ),
    ).toEqual(['aws.opensearch_nodes_4:off']);
  });

  it('the engine does not go while an extra step is on', () => {
    expect(
      ids(
        autoWants(
          { ...calm, pressures: [] },
          liveOf(['aws.opensearch', 'aws.opensearch_nodes_2']),
          new Set(['aws.opensearch']),
        ),
      ),
    ).toEqual([]);
  });

  it('engine off → no step on; a step left on goes', () => {
    expect(
      ids(
        autoWants({ ...calm, pressures: ['search_busy'] }, offAll, new Set()),
      ),
    ).toEqual([]);
    expect(
      ids(
        autoWants(
          { ...calm, pressures: [] },
          liveOf(['aws.opensearch_nodes_2']),
          new Set(),
        ),
      ),
    ).toEqual(['aws.opensearch_nodes_2:off']);
  });

  it('Выкл on a step: never by itself; Вкл needs the step before', () => {
    expect(
      ids(
        autoWants(
          {
            ...calm,
            pressures: ['search_busy'],
            modes: { 'aws.opensearch_nodes_2': 'off' },
          },
          liveOf(['aws.opensearch']),
          new Set(),
        ),
      ),
    ).toEqual([]);
    expect(
      ids(
        autoWants(
          { ...calm, modes: { 'aws.opensearch_nodes_4': 'on' } },
          liveOf(['aws.opensearch']),
          new Set(),
        ),
      ),
    ).toEqual([]);
  });
});

// Owner 2026-11-12 («Да сделай авто для двух защит»): the two WAF
// protections on «Авто», like AWS Shield Advanced automatic application-layer
// mitigation (on while an attack is detected, off after it ends).
describe('autoWants: the two WAF protections on an attack', () => {
  const ids = (w: AutoWant[]) =>
    w
      .map((x) => `${x.id}:${x.to}`)
      .filter((x) => x.startsWith('aws.waf_'))
      .sort();
  const liveOf =
    (on: string[]) =>
    (id: string): 'on' | 'off' =>
      on.includes(id) ? 'on' : 'off';
  const attack = { ...calm, pressures: ['waf_attack'] };
  const quiet = { ...calm, pressures: ['waf_calm'] };

  it('attack → both on (only with the load-balancer WAF on)', () => {
    expect(ids(autoWants(attack, liveOf(['aws.waf_alb']), new Set()))).toEqual([
      'aws.waf_bot_control:on',
      'aws.waf_extra_rules:on',
    ]);
    expect(ids(autoWants(attack, offAll, new Set()))).toEqual([]);
    expect(ids(autoWants(calm, liveOf(['aws.waf_alb']), new Set()))).toEqual(
      [],
    );
  });

  it('already on → nothing more during the attack', () => {
    expect(
      ids(
        autoWants(
          attack,
          liveOf(['aws.waf_alb', 'aws.waf_bot_control', 'aws.waf_extra_rules']),
          new Set(['aws.waf_bot_control', 'aws.waf_extra_rules']),
        ),
      ),
    ).toEqual([]);
  });

  it('calm → off only what went on by itself or was handed to Авто', () => {
    const live = liveOf([
      'aws.waf_alb',
      'aws.waf_bot_control',
      'aws.waf_extra_rules',
    ]);
    expect(
      ids(autoWants(quiet, live, new Set(['aws.waf_bot_control']))),
    ).toEqual(['aws.waf_bot_control:off']);
    expect(
      ids(
        autoWants(
          { ...quiet, pickedAuto: new Set(['aws.waf_extra_rules']) },
          live,
          new Set(),
        ),
      ),
    ).toEqual(['aws.waf_extra_rules:off']);
    // switched on by hand earlier (not handed to Авто): stays
    expect(ids(autoWants(quiet, live, new Set()))).toEqual([]);
    // between half the line and the line (no signal): stays
    expect(
      ids(autoWants(calm, live, new Set(['aws.waf_bot_control']))),
    ).toEqual([]);
  });

  it('Выкл: never on by itself; Вкл: on again and never off by itself', () => {
    expect(
      ids(
        autoWants(
          {
            ...attack,
            modes: {
              'aws.waf_bot_control': 'off',
              'aws.waf_extra_rules': 'off',
            },
          },
          liveOf(['aws.waf_alb']),
          new Set(),
        ),
      ),
    ).toEqual([]);
    expect(
      ids(
        autoWants(
          { ...calm, modes: { 'aws.waf_bot_control': 'on' } },
          liveOf(['aws.waf_alb']),
          new Set(),
        ),
      ),
    ).toEqual(['aws.waf_bot_control:on']);
    expect(
      ids(
        autoWants(
          { ...quiet, modes: { 'aws.waf_bot_control': 'on' } },
          liveOf(['aws.waf_alb', 'aws.waf_bot_control']),
          new Set(['aws.waf_bot_control']),
        ),
      ),
    ).toEqual([]);
  });

  it('hysteresis: on after onMs of attack, off after offMs of calm', () => {
    const on = autoWants(attack, liveOf(['aws.waf_alb']), new Set()).filter(
      (w) => w.id === 'aws.waf_bot_control',
    );
    let r = dueWants(on, {}, 0, 30 * MIN, 72 * H);
    expect(r.due).toEqual([]);
    r = dueWants(on, r.seen, 30 * MIN, 30 * MIN, 72 * H);
    expect(r.due).toEqual(on);
    const off = autoWants(
      quiet,
      liveOf(['aws.waf_alb', 'aws.waf_bot_control']),
      new Set(['aws.waf_bot_control']),
    );
    r = dueWants(off, {}, 0, 30 * MIN, 72 * H);
    r = dueWants([], r.seen, 1 * H, 30 * MIN, 72 * H); // a new spike: start over
    r = dueWants(off, r.seen, 2 * H, 30 * MIN, 72 * H);
    r = dueWants(off, r.seen, 73 * H, 30 * MIN, 72 * H);
    expect(r.due).toEqual([]);
    r = dueWants(off, r.seen, 74 * H, 30 * MIN, 72 * H);
    expect(r.due).toEqual(off);
  });

  it('money: both cost at most $100 a month, so infra.auto_max_usd_month does not hold them back', () => {
    for (const id of ['aws.waf_bot_control', 'aws.waf_extra_rules']) {
      const entry = COST_REGISTRY.find((e) => e.id === id)!;
      const sw = switchFor(id)!;
      const [, high] = costDelta(entry, sw, 'off', 'on');
      expect(high).toBeLessThanOrEqual(100);
      expect(
        autoRefusal({
          mode: 'auto',
          want: { id, to: 'on', reason: '' },
          configured: true,
          inQuietWindow: true,
          activeCount: 0,
          last24h: 0,
          dailyCap: 3,
          budgetRatio: 0.1,
          costHighUsd: high,
          maxUsdMonth: 100,
        }),
      ).toBeNull();
    }
  });
});
