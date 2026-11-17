import { demoContext } from '../common/demo/demo-context';
import {
  isReplayableRead,
  PrismaReadService,
  readOnPrimary,
} from './prisma-read.service';
import { resolveReplicaUrl } from './replica-url';
import { withPoolDefaults } from './prisma.service';
import type { PrismaService } from './prisma.service';

/**
 * Test copies: every read copy gets a fake client (a marker) and a fake
 * lag sample per host, so no test opens a socket. `lag[host]` = the lag the
 * sample answers, an Error = the sample fails (copy unreachable).
 */
function fakeCopies(lag: Record<string, number | Error>) {
  const spy = jest
    .spyOn(
      PrismaReadService.prototype as unknown as {
        makeCopy(url: string): unknown;
      },
      'makeCopy',
    )
    .mockImplementation((url: string) => {
      const host = new URL(url).hostname;
      return {
        raw: {
          $queryRaw: jest.fn(() => {
            const v = lag[host] ?? 0;
            return v instanceof Error
              ? Promise.reject(v)
              : Promise.resolve([{ lag_ms: v }]);
          }),
          $disconnect: jest.fn().mockResolvedValue(undefined),
        },
        client: { marker: host },
        bind: () => undefined,
      };
    });
  return spy;
}

/** First use creates the copies; the sample at once is awaited here. */
async function ready(s: PrismaReadService): Promise<void> {
  void s.db;
  await s.sampleLag();
}

const marker = (c: unknown) => (c as { marker?: string }).marker;

describe('PrismaReadService', () => {
  const primary = { marker: 'primary' } as unknown as PrismaService;
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    jest.restoreAllMocks();
  });

  it('is the primary client while DATABASE_REPLICA_URL is empty', () => {
    delete process.env.DATABASE_REPLICA_URL;
    delete process.env.DB_REPLICA_HOST;
    const s = new PrismaReadService(primary);
    expect(s.db).toBe(primary);
    expect(s.usingReplica).toBe(false);
  });

  it('switches to its own client when the URL is set (no code change)', async () => {
    fakeCopies({});
    process.env.DATABASE_REPLICA_URL =
      'postgresql://u:p@replica.example:5432/lawbid';
    const s = new PrismaReadService(primary);
    await ready(s);
    expect(s.db).not.toBe(primary);
    expect(s.db).toBe(s.db); // one client, created once
    expect(s.usingReplica).toBe(true);
    await s.onApplicationShutdown();
  });

  // Rows 8 / 9 (15.11, KNOWN_ERRORS 161): a stale DB_REPLICA_HOST (copy
  // removed, task revision not updated) sent the first reads of a new task
  // to a gone server: 500s, the 5xx alarm, an ECS rollback. Like an ALB
  // target in "initial", a copy gets reads only after a sample answered.
  it('a new copy gets no read before its first lag sample answered', async () => {
    fakeCopies({});
    process.env.DATABASE_REPLICA_URL = 'postgresql://u:p@replica.example/x';
    const s = new PrismaReadService(primary);
    expect(s.db).toBe(primary); // created, sample in flight
    await s.sampleLag();
    expect(s.db).not.toBe(primary);
    await s.onApplicationShutdown();
  });

  it('a copy that is gone (sample fails) never gets a read', async () => {
    fakeCopies({ 'replica.example': new Error('getaddrinfo ENOTFOUND') });
    process.env.DATABASE_URL = 'postgresql://u:p@primary.example:5432/lawbid';
    process.env.DB_REPLICA_HOST = 'replica.example';
    const s = new PrismaReadService(primary);
    await ready(s);
    expect(s.db).toBe(primary);
    expect(s.replicaLagMs).toBeNull();
    await s.onApplicationShutdown();
  });

  it('builds the replica URL from DATABASE_URL + DB_REPLICA_HOST (no extra secret)', async () => {
    fakeCopies({});
    delete process.env.DATABASE_REPLICA_URL;
    process.env.DATABASE_URL = 'postgresql://u:p@primary.example:5432/lawbid';
    process.env.DB_REPLICA_HOST = 'replica-1.example';
    const s = new PrismaReadService(primary);
    await ready(s);
    expect(s.usingReplica).toBe(true);
    expect(resolveReplicaUrl()).toBe(
      'postgresql://u:p@replica-1.example:5432/lawbid',
    );
    await s.onApplicationShutdown();
  });

  // Owner 2026-11-11: with extra servers the copies are read through a
  // routed client built at start; until it is ready, the primary.
  it('with extra servers: the primary until the routed copy client is ready', () => {
    process.env.DATABASE_REPLICA_URL = 'postgresql://u:p@replica.example/x';
    process.env.DATABASE_URL_SHARDS = '{"s1":"postgresql://u:p@s1/x"}';
    expect(new PrismaReadService(primary).db).toBe(primary);
  });

  it('can be switched off without removing the URL', () => {
    process.env.DATABASE_REPLICA_URL = 'postgresql://u:p@replica.example/x';
    process.env.DB_REPLICA_ENABLED = 'false';
    expect(new PrismaReadService(primary).db).toBe(primary);
  });

  it('never serves a demo request from the replica', async () => {
    fakeCopies({});
    process.env.DATABASE_REPLICA_URL = 'postgresql://u:p@replica.example/x';
    const s = new PrismaReadService(primary);
    await ready(s);
    jest.spyOn(demoContext, 'isDemo').mockReturnValue(true);
    expect(s.db).toBe(primary);
    await s.onApplicationShutdown();
  });

  it('has its own pool size variable (falls back to DB_POOL_SIZE)', () => {
    const env = { DB_POOL_SIZE: '6', DB_READ_POOL_SIZE: '4' };
    expect(
      withPoolDefaults('postgresql://u@h/db', env, 'DB_READ_POOL_SIZE'),
    ).toContain('connection_limit=4');
    expect(
      withPoolDefaults(
        'postgresql://u@h/db',
        { DB_POOL_SIZE: '6' },
        'DB_READ_POOL_SIZE',
      ),
    ).toContain('connection_limit=6');
  });

  describe('lag awareness (DB-ops S5-6)', () => {
    async function withLag(lag: number | Error) {
      fakeCopies({ 'replica.example': lag });
      process.env.DATABASE_REPLICA_URL = 'postgresql://u:p@replica.example/x';
      const s = new PrismaReadService(primary);
      await ready(s);
      return s;
    }

    it('falls back to the primary above the default 5 s', async () => {
      const s = await withLag(8_000);
      expect(s.replicaLagMs).toBe(8_000);
      expect(s.db).toBe(primary);
      expect(s.usingReplica).toBe(false);
      await s.onApplicationShutdown();
    });

    it('uses the replica again once it caught up', async () => {
      const s = await withLag(120);
      expect(s.db).not.toBe(primary);
      await s.onApplicationShutdown();
    });

    it('a per-call maxStalenessMs wins over the default', async () => {
      const s = await withLag(8_000);
      expect(s.readDb({ maxStalenessMs: 10_000 })).not.toBe(primary);
      expect(s.readDb({ maxStalenessMs: 1_000 })).toBe(primary);
      expect(s.readDb({ maxStalenessMs: 0 })).toBe(primary);
      await s.onApplicationShutdown();
    });

    it('DB_REPLICA_MAX_LAG_MS changes the default budget', async () => {
      process.env.DB_REPLICA_MAX_LAG_MS = '20000';
      const s = await withLag(8_000);
      expect(s.db).not.toBe(primary);
      await s.onApplicationShutdown();
    });

    it('a failed sample means "do not trust the replica"', async () => {
      const s = await withLag(new Error('connection refused'));
      expect(s.replicaLagMs).toBeNull();
      expect(s.db).toBe(primary);
      await s.onApplicationShutdown();
    });
  });

  describe('three-state admin switch (off / on / auto)', () => {
    function withMode(mode: string, lag: number) {
      fakeCopies({ 'replica.example': lag });
      process.env.DATABASE_REPLICA_URL = 'postgresql://u:p@replica.example/x';
      const settings = {
        string: jest.fn().mockResolvedValue(mode),
        number: jest.fn().mockResolvedValue(5000),
      };
      return new PrismaReadService(primary, settings as never);
    }

    it('off: always the primary', async () => {
      const s = withMode('off', 0);
      await s.refreshSettings();
      expect(s.db).toBe(primary);
    });

    it('on: the replica even when it lags', async () => {
      const s = withMode('on', 99_000);
      await s.refreshSettings();
      expect(s.db).not.toBe(primary);
      await s.sampleLag();
      expect(s.db).not.toBe(primary);
      await s.onApplicationShutdown();
    });

    it('auto: follows the lag', async () => {
      const s = withMode('auto', 99_000);
      await s.refreshSettings();
      await ready(s);
      expect(s.db).toBe(primary);
      await s.onApplicationShutdown();
    });
  });
});

// Owner 2026-11-11: several read copies share the reads.
describe('PrismaReadService with several copies', () => {
  const primary = { marker: 'primary' } as unknown as PrismaService;
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    jest.restoreAllMocks();
  });
  const two = () => {
    delete process.env.DATABASE_REPLICA_URL;
    process.env.DATABASE_URL = 'postgresql://u:p@primary.example:5432/lawbid';
    process.env.DB_REPLICA_HOST = 'r1.example,r2.example';
  };

  it('reads go to each copy in turn', async () => {
    fakeCopies({});
    two();
    const s = new PrismaReadService(primary);
    await ready(s);
    const a = s.db;
    const b = s.db;
    const c = s.db;
    expect(a).not.toBe(primary);
    expect(b).not.toBe(a);
    expect(c).toBe(a);
    await s.onApplicationShutdown();
  });

  // Row 9 (15.11): «Авто» removes copy 2 while old tasks still list it.
  it('a gone copy 2 is out of the turn, copy 1 keeps serving', async () => {
    fakeCopies({ 'r2.example': new Error('ECONNREFUSED') });
    two();
    const s = new PrismaReadService(primary);
    await ready(s);
    const seen = new Set(
      Array.from({ length: 6 }, () => marker(s.db) as string),
    );
    expect([...seen]).toEqual(['r1.example']);
    await s.onApplicationShutdown();
  });

  it('a copy dropped from DB_REPLICA_HOST is disconnected and never read', async () => {
    const spy = fakeCopies({});
    two();
    const s = new PrismaReadService(primary);
    await ready(s);
    const r2 = spy.mock.results[1].value as {
      raw: { $disconnect: jest.Mock };
    };
    process.env.DB_REPLICA_HOST = 'r1.example';
    const seen = new Set(
      Array.from({ length: 4 }, () => marker(s.db) as string),
    );
    expect([...seen]).toEqual(['r1.example']);
    expect(r2.raw.$disconnect).toHaveBeenCalled();
    await s.onApplicationShutdown();
  });
});

/**
 * Rows 8 / 9 (15.11): the read that meets a gone copy is answered by the
 * primary, with a real Prisma 7 client and a real refused connection
 * (127.0.0.1:1). Before: P1001 / ECONNREFUSED went up to the request (500).
 */
describe('PrismaReadService: a read on a dead copy is answered by the primary', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    jest.restoreAllMocks();
  });

  it('model read and raw SELECT come from the primary, the copy is out for 15 s', async () => {
    process.env.DB_TRANSIENT_RETRIES = '0';
    delete process.env.DATABASE_REPLICA_URL;
    process.env.DATABASE_URL =
      'postgresql://u:p@127.0.0.1:1/lawbid?connect_timeout=2';
    process.env.DB_REPLICA_HOST = '127.0.0.1';
    process.env.DB_REPLICA_PORT = '1';
    const primary = {
      marker: 'primary',
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'p' }]) },
      $queryRaw: jest.fn().mockResolvedValue([{ a: 1 }]),
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ b: 2 }]),
    };
    const s = new PrismaReadService(primary as unknown as PrismaService);
    void s.db; // creates the real copy client
    const copy = [
      ...(
        s as unknown as {
          copies: Map<string, { client: PrismaService; downUntil: number }>;
        }
      ).copies.values(),
    ][0];
    await expect(copy.client.user.findMany({ take: 1 })).resolves.toEqual([
      { id: 'p' },
    ]);
    // The same arguments (the soft-delete filter the copy client added is
    // what the primary adds too).
    expect(primary.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 1 }),
    );
    expect(copy.downUntil).toBeGreaterThan(Date.now() + 10_000);
    await expect(copy.client.$queryRaw`SELECT ${1}::int AS a`).resolves.toEqual(
      [{ a: 1 }],
    );
    const sql = primary.$queryRaw.mock.calls[0][0] as { sql: string };
    expect(sql.sql).toContain('SELECT');
    await expect(
      copy.client.$queryRawUnsafe('SELECT $1::int AS b', 2),
    ).resolves.toEqual([{ b: 2 }]);
    expect(primary.$queryRawUnsafe).toHaveBeenCalledWith(
      'SELECT $1::int AS b',
      2,
    );
    // Out of the rotation: the next reads go straight to the primary.
    expect(s.db).toBe(primary);
    await s.onApplicationShutdown();
  }, 30_000);

  it('a write through the read client is never repeated on the primary', async () => {
    process.env.DB_TRANSIENT_RETRIES = '0';
    delete process.env.DATABASE_REPLICA_URL;
    process.env.DATABASE_URL =
      'postgresql://u:p@127.0.0.1:1/lawbid?connect_timeout=2';
    process.env.DB_REPLICA_HOST = '127.0.0.1';
    process.env.DB_REPLICA_PORT = '1';
    const primary = {
      user: { update: jest.fn() },
      $executeRawUnsafe: jest.fn(),
    };
    const s = new PrismaReadService(primary as unknown as PrismaService);
    void s.db;
    const copy = [
      ...(
        s as unknown as { copies: Map<string, { client: PrismaService }> }
      ).copies.values(),
    ][0];
    await expect(
      copy.client.user.update({ where: { id: 'x' }, data: {} }),
    ).rejects.toBeDefined();
    await expect(
      copy.client.$queryRawUnsafe('DELETE FROM users'),
    ).rejects.toBeDefined();
    expect(primary.user.update).not.toHaveBeenCalled();
    await s.onApplicationShutdown();
  }, 30_000);
});

describe('isReplayableRead / readOnPrimary', () => {
  it('model reads and SELECT / WITH raw text only', () => {
    expect(isReplayableRead('findMany', {})).toBe(true);
    expect(isReplayableRead('count', {})).toBe(true);
    expect(isReplayableRead('update', {})).toBe(false);
    expect(isReplayableRead('$queryRawUnsafe', [' select 1'])).toBe(true);
    expect(isReplayableRead('$queryRawUnsafe', ['DELETE FROM x'])).toBe(false);
    expect(
      isReplayableRead('$queryRaw', { strings: ['WITH a AS (', ')'] }),
    ).toBe(true);
    expect(isReplayableRead('$executeRaw', { sql: 'SELECT 1' })).toBe(false);
  });

  it('a model call goes to the camelCase delegate the shard router keys on', async () => {
    const p = { chatGroupMessage: { count: jest.fn().mockResolvedValue(3) } };
    await expect(
      readOnPrimary(
        p as unknown as PrismaService,
        'ChatGroupMessage',
        'count',
        { where: {} },
      ),
    ).resolves.toBe(3);
    expect(p.chatGroupMessage.count).toHaveBeenCalledWith({ where: {} });
  });
});
