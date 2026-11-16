import { describe, expect, it } from 'vitest';
import type { CostRegistryRow } from './launch';
import type { Economy, ScaleExtras } from './scale';
import { cloudNow, tuningNow, type NowFacts } from './scale-now';

/** Owner 15.11: «Сейчас: …» next to every «Авто» row of «Масштаб». */
const row = (id: string, liveState: 'on' | 'off' | null) => ({ id, liveState }) as unknown as CostRegistryRow;

const economy = {
  containers: {
    services: [
      { kind: 'api', running: 2, desired: 2, spot: true },
      { kind: 'worker', running: 1, desired: 1, spot: true },
      { kind: 'api_admin', running: 1, desired: 1, spot: false },
      { kind: 'admin', running: 1, desired: 1, spot: false },
      { kind: 'pgbouncer', running: 1, desired: 2, spot: null },
    ],
  },
  capacity: {
    dbClass: 'db.t4g.medium',
    dbMultiAz: false,
    replicaCount: 1,
    redisClass: 'cache.t4g.micro',
    redisNodes: 2,
  },
} as unknown as Economy;

const facts: NowFacts = {
  economy,
  extras: { searchEngine: 'postgres' } as ScaleExtras,
  rows: [
    row('aws.rds_replicas', 'on'),
    row('aws.rds_replicas_2', 'off'),
    row('aws.db_shards', 'on'),
    row('aws.db_shards_2', 'on'),
    row('aws.db_shards_3', 'off'),
    row('aws.opensearch', 'on'),
    row('aws.opensearch_nodes_2', 'on'),
    row('aws.opensearch_nodes_4', 'off'),
    row('aws.waf_bot_control', 'off'),
    row('aws.events_stream', 'on'),
    row('aws.redis_cache', 'off'),
    row('aws.ha_extras', 'off'),
    row('aws.macie', 'on'),
  ],
};

describe('cloudNow (Облако rows)', () => {
  it('read copies: the count AWS reports, on every copy row', () => {
    expect(cloudNow('aws.rds_replicas', facts)).toBe('Сейчас: копий базы для чтения: 1');
    expect(cloudNow('aws.rds_replicas_4', facts)).toBe('Сейчас: копий базы для чтения: 1');
  });

  it('read copies without the snapshot: counted from the rows that are on', () => {
    const f = { ...facts, economy: undefined };
    expect(cloudNow('aws.rds_replicas_2', f)).toBe('Сейчас: копий базы для чтения: 1');
  });

  it('database servers: the main one plus each extra server that is on', () => {
    expect(cloudNow('aws.db_shards_2', facts)).toBe('Сейчас: серверов базы: 3');
  });

  it('database servers past the fourth (db.max_servers raised): counted too', () => {
    const on = ['aws.db_shards', 'aws.db_shards_2', 'aws.db_shards_3', 'aws.db_shards_4', 'aws.db_shards_5'];
    const f = { ...facts, rows: [...on.map((id) => row(id, 'on')), row('aws.db_shards_6', 'off')] };
    expect(cloudNow('aws.db_shards_5', f)).toBe('Сейчас: серверов базы: 6');
  });

  it('search: domain and node count, and who searches', () => {
    expect(cloudNow('aws.opensearch_nodes_4', facts)).toBe(
      'Сейчас: движок поиска включён, узлов: 2, ищет Встроенный поиск (PostgreSQL)',
    );
  });

  it('search past four nodes (owner 15.11, search.max_nodes): the highest step that is on', () => {
    const f = {
      ...facts,
      rows: [
        ...(facts.rows ?? []).filter((r) => !r.id.startsWith('aws.opensearch_nodes')),
        row('aws.opensearch_nodes_2', 'on'),
        row('aws.opensearch_nodes_4', 'on'),
        row('aws.opensearch_nodes_6', 'on'),
        row('aws.opensearch_nodes_8', 'on'),
        row('aws.opensearch_nodes_10', 'off'),
      ],
    };
    expect(cloudNow('aws.opensearch_nodes_10', f)).toBe(
      'Сейчас: движок поиска включён, узлов: 8, ищет Встроенный поиск (PostgreSQL)',
    );
  });

  it('WAF, Kinesis, cache Redis: on / off', () => {
    expect(cloudNow('aws.waf_bot_control', facts)).toBe('Сейчас: правила WAF выключены');
    expect(cloudNow('aws.events_stream', facts)).toBe('Сейчас: поток Kinesis включён');
    expect(cloudNow('aws.redis_cache', facts)).toBe('Сейчас: отдельного Redis для кэша нет');
  });

  it('PgBouncer: its tasks; Spot: which services; HA: the standby and the API tasks', () => {
    expect(cloudNow('aws.pgbouncer', facts)).toBe('Сейчас: PgBouncer 1 из 2');
    expect(cloudNow('aws.graviton_spot', facts)).toBe('Сейчас: на Spot: API, фоновые; обычные: API админки, админка');
    expect(cloudNow('aws.ha_extras', facts)).toBe(
      'Сейчас: запасной копии базы в другой зоне нет, запас выключен, API 2 из 2',
    );
  });

  it('any other row: on / off, and «нет данных» when nothing is known', () => {
    expect(cloudNow('aws.macie', facts)).toBe('Сейчас: включено');
    expect(cloudNow('aws.inspector', facts)).toBe('Сейчас: нет данных');
  });
});

describe('tuningNow («Числа «Авто»» cards)', () => {
  it('Redis: node type and node count', () => {
    expect(tuningNow('redis', facts)).toBe('Сейчас: cache.t4g.micro, узлов: 2');
  });

  it('database: class, standby, read copies, servers', () => {
    expect(tuningNow('db', facts)).toBe(
      'Сейчас: db.t4g.medium, запасной копии в другой зоне нет, копий для чтения: 1, серверов базы: 3',
    );
  });

  it('servers: every ECS service running of wanted, and Spot', () => {
    expect(tuningNow('ecs', facts)).toBe(
      'Сейчас (работает из нужных): API 2 из 2, фоновые 1 из 1, API админки 1 из 1, админка 1 из 1, PgBouncer 1 из 2; на Spot: API, фоновые; обычные: API админки, админка',
    );
  });

  it('spot fallback card (#1120): which services run on Spot', () => {
    expect(tuningNow('spot', facts)).toBe(
      'Сейчас: на Spot: API, фоновые; обычные: API админки, админка',
    );
    expect(tuningNow('spot', {})).toBe('Сейчас: нет данных');
  });

  it('nothing loaded yet: «нет данных», never a crash', () => {
    expect(tuningNow('ecs', {})).toBe('Сейчас: нет данных');
    expect(tuningNow('db', {})).toBe('Сейчас: нет данных');
    expect(tuningNow('endpoints', {})).toMatch(/^Сейчас: /);
  });
});
