import type { ConfigService } from '@nestjs/config';
import type { AppSettingsService } from '../common/app-settings/app-settings.service';
import type { AppSettingsWriter } from '../common/app-settings/app-settings.writer';
import type { PrismaService } from '../prisma/prisma.service';
import {
  COMMANDS_KEY,
  MONTHS_AHEAD,
  PartitionService,
  RUNNER_KEY,
} from './partition.service';

function make(values: Record<string, string | number>) {
  const writes: unknown[] = [];
  const settings = {
    string: (k: string) => Promise.resolve(String(values[k] ?? 'off')),
    number: (k: string) => Promise.resolve(Number(values[k] ?? 50_000_000)),
  } as unknown as AppSettingsService;
  const writer = {
    write: (...a: unknown[]) => {
      writes.push(a);
      return Promise.resolve();
    },
  } as unknown as AppSettingsWriter;
  const svc = new PartitionService(
    {} as PrismaService,
    { get: () => undefined } as unknown as ConfigService,
    settings,
    writer,
  );
  return { svc, writes };
}

describe('PartitionService modes (hash tables and post_view_events)', () => {
  it('everything is «off» by default and for unknown values', async () => {
    const { svc } = make({ 'partition.notifications_mode': 'sometimes' });
    expect(await svc.mode('messages')).toBe('off');
    expect(await svc.mode('notifications')).toBe('off');
    expect(await svc.mode('audit_log')).toBe('off');
  });

  it('reads «on» and «auto» and the admin-editable threshold', async () => {
    const { svc } = make({
      'partition.messages_mode': 'auto',
      'partition.chat_group_messages_mode': 'on',
      'partition.auto_rows': 20_000_000,
    });
    expect(await svc.mode('messages')).toBe('auto');
    expect(await svc.mode('chat_group_messages')).toBe('on');
    expect(await svc.autoRows()).toBe(20_000_000);
  });

  it('setMode writes one audited setting, only for switchable tables', async () => {
    const { svc, writes } = make({});
    await svc.setMode('messages', 'auto', 'admin-1');
    expect(writes).toEqual([
      ['admin-1', 'ops.partition_mode', { 'partition.messages_mode': 'auto' }],
    ]);
    await expect(svc.setMode('audit_log', 'on', 'admin-1')).rejects.toThrow();
  });

  it('resetMode (after undo / abort) turns a non-off mode back to off', async () => {
    const { svc, writes } = make({ 'partition.notifications_mode': 'on' });
    await svc.resetMode('notifications', 'admin-1');
    expect(writes).toHaveLength(1);
    const again = make({});
    await again.svc.resetMode('notifications', 'admin-1');
    expect(again.writes).toHaveLength(0);
  });

  it('autoStart does nothing without the runner role', async () => {
    const { svc } = make({ 'partition.messages_mode': 'on' });
    expect(await svc.autoStart()).toEqual([]);
  });

  describe('autoStart for the monthly post_view_events', () => {
    const build = (
      values: Record<string, string | number>,
      rows: number,
      job: { phase: string } | null = null,
    ) => {
      const started: string[] = [];
      const run = {
        activeJobs: () => Promise.resolve([]),
        stats: () =>
          Promise.resolve({ exists: true, partitioned: false, rows }),
        job: () => Promise.resolve(job),
        precheck: () => Promise.resolve({ ok: true, reasons: [] }),
        start: (spec: { table: string }) => {
          started.push(spec.table);
          return Promise.resolve({});
        },
      };
      const { svc } = make(values);
      Object.defineProperty(svc, 'runnerConfigured', { get: () => true });
      (svc as unknown as { runnerRw: () => unknown }).runnerRw = () => run;
      return { svc, started };
    };

    it('reads and writes its mode like the hash tables', async () => {
      const { svc, writes } = make({
        'partition.post_view_events_mode': 'auto',
      });
      expect(await svc.mode('post_view_events')).toBe('auto');
      await svc.setMode('post_view_events', 'on', 'admin-1');
      expect(writes).toEqual([
        [
          'admin-1',
          'ops.partition_mode',
          { 'partition.post_view_events_mode': 'on' },
        ],
      ]);
    });

    it('«auto» waits for the threshold, then starts the month conversion', async () => {
      const values = {
        'partition.post_view_events_mode': 'auto',
        'partition.auto_rows': 1000,
      };
      const small = build(values, 999);
      expect(await small.svc.autoStart()).toEqual([]);
      const big = build(values, 1000);
      expect(await big.svc.autoStart()).toEqual(['post_view_events']);
      expect(big.started).toEqual(['post_view_events']);
    });

    it('a table that is already partitioned or has an active job is skipped', async () => {
      const values = { 'partition.post_view_events_mode': 'on' };
      const { svc, started } = build(values, 5);
      const rw = (
        svc as unknown as { runnerRw: () => Record<string, unknown> }
      ).runnerRw();
      rw.activeJobs = () => Promise.resolve([{ tbl: 'messages' }]);
      expect(await svc.autoStart()).toEqual([]);
      expect(started).toEqual([]);
      rw.activeJobs = () => Promise.resolve([]);
      rw.stats = () =>
        Promise.resolve({ exists: true, partitioned: true, rows: 9e9 });
      expect(await svc.autoStart()).toEqual([]);
    });

    it('a failing precheck is skipped, not started', async () => {
      const { svc, started } = build(
        { 'partition.post_view_events_mode': 'on' },
        5,
      );
      const rw = (
        svc as unknown as { runnerRw: () => Record<string, unknown> }
      ).runnerRw();
      rw.precheck = () => Promise.resolve({ ok: false, reasons: ['x'] });
      expect(await svc.autoStart()).toEqual([]);
      expect(started).toEqual([]);
    });

    it('«off» never starts, «on» starts at any size, an undone job is not repeated', async () => {
      expect(
        await build(
          { 'partition.post_view_events_mode': 'off' },
          9e9,
        ).svc.autoStart(),
      ).toEqual([]);
      expect(
        await build(
          { 'partition.post_view_events_mode': 'on' },
          5,
        ).svc.autoStart(),
      ).toEqual(['post_view_events']);
      expect(
        await build({ 'partition.post_view_events_mode': 'on' }, 5, {
          phase: 'aborted',
        }).svc.autoStart(),
      ).toEqual([]);
    });
  });
});

describe('PartitionService.shardSignal (cheap catalog reads only)', () => {
  const GB = 1024 ** 3;
  function withDb(opts: {
    bytes: number;
    rows: number;
    map: { physical_db: string; n: number }[];
    shardsEnv?: string;
  }) {
    const sql: string[] = [];
    const prisma = {
      $queryRawUnsafe: (q: string) => {
        sql.push(q);
        if (q.includes('pg_database_size'))
          return Promise.resolve([{ bytes: opts.bytes }]);
        if (q.includes('shard_map')) return Promise.resolve(opts.map);
        return Promise.resolve([{ rows: opts.rows }]);
      },
    } as unknown as PrismaService;
    const settings = {
      string: () => Promise.resolve('off'),
      number: (k: string) =>
        Promise.resolve(
          k === 'growth.shard_db_gb'
            ? 400
            : k === 'growth.shard_rows'
              ? 1_000_000_000
              : 50_000_000,
        ),
    } as unknown as AppSettingsService;
    const svc = new PartitionService(
      prisma,
      {
        get: (k: string) =>
          k === 'DATABASE_URL_SHARDS' ? opts.shardsEnv : undefined,
      } as unknown as ConfigService,
      settings,
    );
    return { svc, sql };
  }

  it('green and no COUNT(*): only pg_database_size, pg_class and shard_map', async () => {
    const { svc, sql } = withDb({
      bytes: 20 * GB,
      rows: 10_000_000,
      map: [{ physical_db: 'primary', n: 256 }],
    });
    const g = await svc.shardSignal();
    expect(g.status).toBe('green');
    expect(g.targetReady).toBe(false);
    expect(g.autoMove).toBe(false);
    expect(sql).toHaveLength(3);
    // The only count(*) allowed is the GROUP BY over the 256-row shard_map.
    expect(sql.filter((q) => /count\s*\(/i.test(q))).toHaveLength(1);
    expect(sql.find((q) => /count\s*\(/i.test(q))).toMatch(/FROM shard_map/);
    expect(sql.join(' ')).toMatch(/pg_database_size|reltuples|shard_map/);
  });

  it('yellow with a ready plan and a configured second database', async () => {
    const { svc } = withDb({
      bytes: 340 * GB,
      rows: 400_000_000,
      map: [{ physical_db: 'primary', n: 256 }],
      shardsEnv: '{"db1":"postgresql://u@h/d"}',
    });
    const g = await svc.shardSignal();
    expect(g.status).toBe('yellow');
    expect(g.targets).toEqual(['db1']);
    expect(g.plan?.shards).toBe(128);
  });

  it('shards already moved: the plan covers only what is left on the primary', async () => {
    const { svc } = withDb({
      bytes: 450 * GB,
      rows: 2_000_000_000,
      map: [
        { physical_db: 'primary', n: 128 },
        { physical_db: 'db1', n: 128 },
      ],
    });
    const g = await svc.shardSignal();
    expect(g.status).toBe('red');
    expect(g.plan?.shards).toBe(64);
  });
});

describe('PartitionService.maintain SQL signature', () => {
  it('casts $2 to int: Prisma binds JS numbers as bigint, the DB functions take (text, integer)', async () => {
    const calls: string[] = [];
    const args: unknown[][] = [];
    const prisma = {
      $queryRawUnsafe: (sql: string, ...a: unknown[]) => {
        calls.push(sql);
        args.push(a);
        return Promise.resolve([{ n: 1 }]);
      },
    } as unknown as PrismaService;
    const svc = new PartitionService(
      prisma,
      { get: () => undefined } as unknown as ConfigService,
      {} as AppSettingsService,
      {} as AppSettingsWriter,
    );
    const { created } = await svc.maintain();
    expect(Object.values(created)).toEqual(calls.map(() => 1));
    for (const a of args) expect(a[1]).toBe(MONTHS_AHEAD);
    expect(calls.length).toBeGreaterThan(0);
    for (const sql of calls) {
      expect(sql).toMatch(/\(\$1::text, \$2::int\)/);
    }
  });
});

describe('PartitionService buttons when only the worker has the login (owner 2026-11-12)', () => {
  /** A tiny in-memory Redis: exists / set / get / del / rpush / lpop. */
  function fakeRedis() {
    const kv = new Map<string, string>();
    const lists = new Map<string, string[]>();
    return {
      kv,
      lists,
      exists: (k: string) => Promise.resolve(kv.has(k) ? 1 : 0),
      set: (k: string, v: string) => {
        kv.set(k, v);
        return Promise.resolve('OK');
      },
      get: (k: string) => Promise.resolve(kv.get(k) ?? null),
      del: (k: string) => Promise.resolve(kv.delete(k) ? 1 : 0),
      rpush: (k: string, v: string) => {
        const l = lists.get(k) ?? [];
        l.push(v);
        lists.set(k, l);
        return Promise.resolve(l.length);
      },
      lpop: (k: string) => Promise.resolve(lists.get(k)?.shift() ?? null),
    };
  }
  const build = (redis: ReturnType<typeof fakeRedis>, login: boolean) =>
    new PartitionService(
      {} as PrismaService,
      {
        get: (k: string) =>
          login && k === 'PARTITION_DATABASE_URL'
            ? 'postgresql://lawbid_partition:x@db/lawbid'
            : undefined,
      } as unknown as ConfigService,
      undefined,
      undefined,
      redis as never,
    );

  it('API without the login and no worker heartbeat: the plain «no login» error', async () => {
    const redis = fakeRedis();
    const api = build(redis, false);
    expect(await api.runnerReady()).toBe(false);
    await expect(api.start('messages', 'admin-1')).rejects.toThrow(
      /lawbid_partition/,
    );
    expect(redis.lists.get(COMMANDS_KEY)).toBeUndefined();
  });

  it('API queues the button while the worker has the login; the worker carries it out', async () => {
    const redis = fakeRedis();
    redis.kv.set(RUNNER_KEY, '1');
    const api = build(redis, false);
    expect(await api.runnerReady()).toBe(true);
    await api.start('messages', 'admin-1');
    await api.pause('messages', true);
    expect(redis.lists.get(COMMANDS_KEY)).toHaveLength(2);

    const worker = build(redis, true);
    const did: string[] = [];
    (worker as unknown as { runnerRw: () => unknown }).runnerRw = () => ({
      start: (spec: { table: string }, by: string) => {
        did.push(`start ${spec.table} ${by}`);
        return Promise.resolve({});
      },
      pause: (table: string, paused: boolean) => {
        did.push(`pause ${table} ${paused}`);
        return Promise.resolve();
      },
    });
    expect(await worker.drainCommands()).toBe(2);
    expect(did).toEqual(['start messages admin-1', 'pause messages true']);
    expect(redis.lists.get(COMMANDS_KEY)).toEqual([]);
  });

  it('a queued command that fails is kept as the card error, not lost', async () => {
    const redis = fakeRedis();
    redis.kv.set(RUNNER_KEY, '1');
    await build(redis, false).retry('notifications');
    const worker = build(redis, true);
    (worker as unknown as { runnerRw: () => unknown }).runnerRw = () => ({
      retry: () => Promise.reject(new Error('lock timeout')),
    });
    expect(await worker.drainCommands()).toBe(0);
    expect(redis.kv.get('ops:partition:cmd-error:notifications')).toBe(
      'lock timeout',
    );
  });

  it('unknown tables are refused before anything is queued', async () => {
    const redis = fakeRedis();
    redis.kv.set(RUNNER_KEY, '1');
    await expect(build(redis, false).undo('users')).rejects.toThrow(
      /нельзя разделить/,
    );
    expect(redis.lists.get(COMMANDS_KEY)).toBeUndefined();
  });
});

describe('PartitionService.jobs: no query on a missing state table (14.11 F8)', () => {
  function withTable(exists: boolean) {
    const sql: string[] = [];
    const prisma = {
      $queryRawUnsafe: (q: string) => {
        sql.push(q);
        if (q.includes('to_regclass'))
          return Promise.resolve([{ t: exists ? '_partition_job' : null }]);
        return Promise.resolve([{ tbl: 'messages', phase: 'backfill' }]);
      },
    } as unknown as PrismaService;
    const svc = new PartitionService(
      prisma,
      { get: () => undefined } as unknown as ConfigService,
      {} as AppSettingsService,
    );
    const jobs = () =>
      (svc as unknown as { jobs(): Promise<Map<string, unknown>> }).jobs();
    return { jobs, sql };
  }

  it('table missing: only to_regclass, never FROM public._partition_job', async () => {
    const { jobs, sql } = withTable(false);
    expect((await jobs()).size).toBe(0);
    expect(sql).toHaveLength(1);
    expect(sql[0]).toMatch(/to_regclass\('public\._partition_job'\)/);
    expect(sql.some((q) => /FROM public\._partition_job/.test(q))).toBe(false);
  });

  it('table present: reads the jobs as before', async () => {
    const { jobs, sql } = withTable(true);
    expect((await jobs()).get('messages')).toMatchObject({ phase: 'backfill' });
    expect(sql).toHaveLength(2);
  });
});
