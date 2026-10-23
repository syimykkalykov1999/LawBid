import { demoContext } from '../common/demo/demo-context';
import { PrismaReadService } from './prisma-read.service';
import { withPoolDefaults } from './prisma.service';
import type { PrismaService } from './prisma.service';

describe('PrismaReadService', () => {
  const primary = { marker: 'primary' } as unknown as PrismaService;
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
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
});
