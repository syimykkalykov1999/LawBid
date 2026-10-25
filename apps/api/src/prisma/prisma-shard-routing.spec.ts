import { demoContext } from '../common/demo/demo-context';
import { newShardedId } from '../sharding/shard-id';
import { shardContext } from '../sharding/shard-context';
import { ShardMapRow } from '../sharding/shard-router';
import { shardStats } from '../sharding/shard-stats';
import { PrismaService, routingOf } from './prisma.service';

/** Which physical client a property access lands on, via `$extends`-free
 * identity: every extended client is a distinct object. */
function rows(db1: number[]): ShardMapRow[] {
  return Array.from({ length: 256 }, (_, i) => ({
    logical_shard: i,
    physical_db: db1.includes(i) ? 'db1' : 'primary',
    version: 1,
  }));
}

describe('PrismaService shard routing (shard-ready steps 3-4)', () => {
  const saved = {
    url: process.env.DATABASE_URL,
    shards: process.env.DATABASE_URL_SHARDS,
  };
  afterEach(() => {
    process.env.DATABASE_URL = saved.url;
    if (saved.shards === undefined) delete process.env.DATABASE_URL_SHARDS;
    else process.env.DATABASE_URL_SHARDS = saved.shards;
  });

  describe('one physical database (today)', () => {
    let svc: PrismaService;
    beforeAll(() => {
      delete process.env.DATABASE_URL_SHARDS;
      process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/one';
      svc = new PrismaService();
    });
    afterAll(() => svc.$disconnect());

    it('forShard / forCase / forUser / global are all the same client', () => {
      const g = svc.global();
      expect(svc.forShard(5)).toBe(g);
      expect(svc.forCase(newShardedId(200))).toBe(g);
      expect(svc.forUser('00000000-0000-4000-8000-000000000007')).toBe(g);
      expect(g).toBe(routingOf(svc).realClient());
    });

    it('a shard context changes nothing', () => {
      const before = svc.case;
      shardContext.run(9, () => expect(svc.case).toBe(before));
    });

    it('counts a sharded-model access without a context, not a global one', () => {
      shardStats.drain();
      void svc.user; // global
      void svc.case; // sharded, no context
      shardContext.run(3, () => void svc.case); // has context
      shardContext.run(3, () => void svc.case, 'auth'); // weak context
      expect(shardStats.drain()).toEqual({
        total: 1,
        byModel: { Case: 1 },
        weakTotal: 1,
        weakByModel: { Case: 1 },
      });
    });

    it('an unknown physical key is a clear error, not a silent primary', () => {
      expect(() => routingOf(svc).clientFor('db9')).toThrow(/db9/);
    });
  });

  describe('two physical databases', () => {
    let svc: PrismaService;
    beforeAll(() => {
      process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/one';
      process.env.DATABASE_URL_SHARDS = JSON.stringify({
        db1: 'postgresql://u:p@localhost:5432/two',
      });
      svc = new PrismaService();
      routingOf(svc).router.apply(rows([1, 3, 5]));
    });
    afterAll(async () => {
      await svc.$disconnect();
      await routingOf(svc).disconnectShardDatabases();
    });

    it('explicit routing follows shard_map', () => {
      const primary = svc.global();
      const db1 = svc.forShard(1);
      expect(db1).not.toBe(primary);
      expect(svc.forShard(2)).toBe(primary);
      expect(svc.forShard(3)).toBe(db1);
      expect(svc.forCase(newShardedId(5))).toBe(db1);
      expect(svc.forCase(newShardedId(4))).toBe(primary);
      expect(svc.forUser('00000000-0000-4000-8000-000000000003')).toBe(db1);
    });

    it('sharded models follow the context, global models stay on primary', () => {
      const primary = svc.global();
      const db1 = svc.forShard(1);
      expect(svc.case).toBe(primary.case); // no context
      shardContext.run(1, () => {
        expect(svc.case).toBe(db1.case);
        expect(svc.user).toBe(primary.user);
        expect(svc.notification).toBe(db1.notification);
        expect(typeof svc.$transaction).toBe('function');
      });
      shardContext.run(2, () => expect(svc.case).toBe(primary.case));
      shardContext.runOnPhysical('db1', () => expect(svc.post).toBe(db1.post));
    });

    it('demo mode wins over every shard', () => {
      shardContext.run(1, () =>
        demoContext.runDemo(() => {
          expect(() => svc.case).toThrow(/Demo database unavailable/);
          expect(() => svc.forShard(1)).toThrow(/Demo database unavailable/);
        }),
      );
    });
  });
});
