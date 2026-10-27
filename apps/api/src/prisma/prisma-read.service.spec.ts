import { demoContext } from '../common/demo/demo-context';
import { PrismaReadService } from './prisma-read.service';
import { resolveReplicaUrl } from './replica-url';
import { withPoolDefaults } from './prisma.service';
import type { PrismaService } from './prisma.service';

describe('PrismaReadService', () => {
  const primary = { marker: 'primary' } as unknown as PrismaService;
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    jest.restoreAllMocks();
  });

  it('is the primary client while DATABASE_REPLICA_URL is empty', () => {
    delete process.env.DATABASE_REPLICA_URL;
    const s = new PrismaReadService(primary);
    expect(s.db).toBe(primary);
    expect(s.usingReplica).toBe(false);
  });

  it('switches to its own client when the URL is set (no code change)', async () => {
    process.env.DATABASE_REPLICA_URL =
      'postgresql://u:p@replica.example:5432/lawbid';
    const s = new PrismaReadService(primary);
    expect(s.db).not.toBe(primary);
    expect(s.db).toBe(s.db); // one client, created once
    expect(s.usingReplica).toBe(true);
    await s.onModuleDestroy();
  });

  it('builds the replica URL from DATABASE_URL + DB_REPLICA_HOST (no extra secret)', async () => {
    delete process.env.DATABASE_REPLICA_URL;
    process.env.DATABASE_URL = 'postgresql://u:p@primary.example:5432/lawbid';
    process.env.DB_REPLICA_HOST = 'replica-1.example';
    const s = new PrismaReadService(primary);
    expect(s.usingReplica).toBe(true);
    expect(resolveReplicaUrl()).toBe(
      'postgresql://u:p@replica-1.example:5432/lawbid',
    );
    await s.onModuleDestroy();
  });

  it('stays on the primary once shard databases are configured', () => {
    process.env.DATABASE_REPLICA_URL = 'postgresql://u:p@replica.example/x';
    process.env.DATABASE_URL_SHARDS = '{"s1":"postgresql://u:p@s1/x"}';
    expect(new PrismaReadService(primary).db).toBe(primary);
  });

  it('can be switched off without removing the URL', () => {
    process.env.DATABASE_REPLICA_URL = 'postgresql://u:p@replica.example/x';
    process.env.DB_REPLICA_ENABLED = 'false';
    expect(new PrismaReadService(primary).db).toBe(primary);
  });

  it('never serves a demo request from the replica', () => {
    process.env.DATABASE_REPLICA_URL = 'postgresql://u:p@replica.example/x';
    const s = new PrismaReadService(primary);
    jest.spyOn(demoContext, 'isDemo').mockReturnValue(true);
    expect(s.db).toBe(primary);
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
      process.env.DATABASE_REPLICA_URL = 'postgresql://u:p@replica.example/x';
      const s = new PrismaReadService(primary);
      expect(s.db).not.toBe(primary); // creates the replica client
      const $queryRaw =
        lag instanceof Error
          ? jest.fn().mockRejectedValue(lag)
          : jest.fn().mockResolvedValue([{ lag_ms: lag }]);
      (s as unknown as { raw: unknown }).raw = {
        $queryRaw,
        $disconnect: jest.fn().mockResolvedValue(undefined),
      };
      await s.sampleLag();
      return s;
    }

    it('falls back to the primary above the default 5 s', async () => {
      const s = await withLag(8_000);
      expect(s.replicaLagMs).toBe(8_000);
      expect(s.db).toBe(primary);
      expect(s.usingReplica).toBe(false);
      await s.onModuleDestroy();
    });

    it('uses the replica again once it caught up', async () => {
      const s = await withLag(120);
      expect(s.db).not.toBe(primary);
      await s.onModuleDestroy();
    });

    it('a per-call maxStalenessMs wins over the default', async () => {
      const s = await withLag(8_000);
      expect(s.readDb({ maxStalenessMs: 10_000 })).not.toBe(primary);
      expect(s.readDb({ maxStalenessMs: 1_000 })).toBe(primary);
      expect(s.readDb({ maxStalenessMs: 0 })).toBe(primary);
      await s.onModuleDestroy();
    });

    it('DB_REPLICA_MAX_LAG_MS changes the default budget', async () => {
      process.env.DB_REPLICA_MAX_LAG_MS = '20000';
      const s = await withLag(8_000);
      expect(s.db).not.toBe(primary);
      await s.onModuleDestroy();
    });

    it('a failed sample means "do not trust the replica"', async () => {
      const s = await withLag(new Error('connection refused'));
      expect(s.replicaLagMs).toBeNull();
      expect(s.db).toBe(primary);
      await s.onModuleDestroy();
    });
  });

  describe('three-state admin switch (off / on / auto)', () => {
    function withMode(mode: string) {
      process.env.DATABASE_REPLICA_URL = 'postgresql://u:p@replica.example/x';
      const settings = {
        string: jest.fn().mockResolvedValue(mode),
        number: jest.fn().mockResolvedValue(5000),
      };
      return new PrismaReadService(primary, settings as never);
    }

    it('off: always the primary', async () => {
      const s = withMode('off');
      await s.refreshSettings();
      expect(s.db).toBe(primary);
    });

    it('on: the replica even when it lags', async () => {
      const s = withMode('on');
      await s.refreshSettings();
      expect(s.db).not.toBe(primary);
      (s as unknown as { raw: unknown }).raw = {
        $queryRaw: jest.fn().mockResolvedValue([{ lag_ms: 99_000 }]),
        $disconnect: jest.fn().mockResolvedValue(undefined),
      };
      await s.sampleLag();
      expect(s.db).not.toBe(primary);
      await s.onModuleDestroy();
    });

    it('auto: follows the lag', async () => {
      const s = withMode('auto');
      await s.refreshSettings();
      expect(s.db).not.toBe(primary);
      (s as unknown as { raw: unknown }).raw = {
        $queryRaw: jest.fn().mockResolvedValue([{ lag_ms: 99_000 }]),
        $disconnect: jest.fn().mockResolvedValue(undefined),
      };
      await s.sampleLag();
      expect(s.db).toBe(primary);
      await s.onModuleDestroy();
    });
  });
});
