/* eslint-disable @typescript-eslint/require-await -- fakes */
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaService, routingOf } from '../src/prisma/prisma.service';
import { MoveDbPool } from '../src/sharding/move/move-db';
import { ID_ROUTED, PgMoveOps } from '../src/sharding/move/pg-move-ops';
import { ShardMoveService } from '../src/sharding/move/shard-move.service';
import { ShardMapSync } from '../src/sharding/shard-map-sync';
import { shardContext } from '../src/sharding/shard-context';
import { OrphanChecker } from '../src/sharding/orphan-checker';
import { remainingCrossFamilyForeignKeys } from '../src/sharding/move/cross-family-fks';
import { ShardMoveRunner } from '../src/sharding/move/shard-move.runner';
import { MemoryMoveLease } from '../src/sharding/move/move-lease';

/**
 * Shard-ready step 10 on real PostgreSQL: moves ONE logical shard between
 * the two databases of the two-DB mode (E2E_TWO_DB=odd|all), with writes
 * running during the move, then verifies, flips, reads, rolls back (before
 * and after the flip) and cleans up. Needs DATABASE_URL_SHARDS (db1).
 */
const twoDb = !!process.env.DATABASE_URL_SHARDS;
(twoDb ? describe : describe.skip)(
  'move shard (real PostgreSQL, two databases)',
  () => {
    const prisma = new PrismaService();
    const raw: Record<string, PrismaClient> = {};
    let service: ShardMoveService;
    let pool: MoveDbPool;
    // shard_map as the suite found it: the moves below flip shards, and the
    // later suites of the same run (shard-triggers) expect the original map.
    let mapBefore: Array<{
      logical_shard: number;
      physical_db: string;
      state: string;
    }> = [];
    const log = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const userWithShard = (shard: number) =>
      // hashShard(user id) = last byte of the id
      `${randomUUID().slice(0, 34)}${shard.toString(16).padStart(2, '0')}`;

    const notify = (userId: string, shard: number) =>
      shardContext.run(shard, () =>
        prisma.notification.create({
          data: {
            user_id: userId,
            type: 'contact_joined',
            category: 'messages',
            payload: {},
          },
          select: { id: true },
        }),
      );

    const countOn = async (db: string, userId: string) =>
      raw[db].notification.count({ where: { user_id: userId } });

    const physical = () => routingOf(prisma).router;

    /**
     * WHY the shards are not hard-coded (flaky on CI 2026-10-27, six runs): in
     * the two-DB job this suite runs in the same database as dozens of earlier
     * suites whose users and cases get random ids, and a row lands in shard N
     * whenever its owner's id ends in byte N. With ~100 random users about a
     * third of all shards are dirty, so a fixed shard 10 / 12 / 14 ... was
     * hit by luck, and ANY stray row makes the move's preflight refuse it:
     * rows of the shard point to a row of another shard (case_states.case_id
     * -> a case in another shard), legacy v4 ids that the router would look
     * up in a different shard, rows already on the target. Reproduced by
     * running the same suites in the CI order before this one.
     *
     * So the suite claims shards that PROVABLY hold nothing, on every
     * database, before it seeds anything: no row with that shard_id in any
     * sharded table, and no legacy (non-v8) id in the id-routed tables whose
     * last byte names that shard while it is stored in another (the things
     * the preflight looks at).
     */
    const claimFreeShards = async (count: number): Promise<number[]> => {
      const stored = new Set<number>(); // shard_id of any row, any database
      const legacy: Record<string, Set<number>> = {}; // per SOURCE database
      for (const key of pool.keys()) {
        const db = pool.get(key);
        legacy[key] = new Set();
        for (const t of new PgMoveOps(db, db).tables()) {
          const shards = await db.query<{ s: number }>(
            `SELECT DISTINCT shard_id::int AS s FROM "${t.table}"`,
          );
          for (const r of shards) stored.add(r.s);
          if (!ID_ROUTED.includes(t.model)) continue;
          const bytes = await db.query<{ s: number }>(
            `SELECT DISTINCT ('x' || right(id::text, 2))::bit(8)::int AS s
               FROM "${t.table}"
              WHERE substr(id::text, 15, 1) <> '8'
                AND ('x' || right(id::text, 2))::bit(8)::int <> shard_id`,
          );
          for (const r of bytes) legacy[key].add(r.s);
        }
      }
      // Only shards the map routes normally can be moved; the legacy-id rule
      // is read on the database the shard would be moved FROM.
      const free = mapBefore
        .filter(
          (m) =>
            m.state === 'active' &&
            !stored.has(m.logical_shard) &&
            !legacy[m.physical_db]?.has(m.logical_shard),
        )
        .map((m) => m.logical_shard)
        .sort((x, y) => x - y);
      // A fixed pick (the lowest free ones) keeps a run reproducible.
      expect(free.length).toBeGreaterThanOrEqual(count);
      return free.slice(0, count);
    };
    let shards: number[] = [];

    /** What the runner says about a finished move, for a readable failure. */
    const outcome = (m: {
      status: string;
      state: string;
      error: string | null;
    }) => ({
      status: m.status,
      state: m.state,
      error: m.error,
    });

    beforeAll(async () => {
      await prisma.onModuleInit();
      pool = new MoveDbPool();
      for (const k of pool.keys()) {
        const url =
          k === 'primary'
            ? process.env.DATABASE_URL!
            : (
                JSON.parse(process.env.DATABASE_URL_SHARDS!) as Record<
                  string,
                  string
                >
              )[k];
        raw[k] = new PrismaClient({ datasourceUrl: url });
      }
      mapBefore = await raw.primary.shardMap.findMany({
        select: { logical_shard: true, physical_db: true, state: true },
      });
      shards = await claimFreeShards(6);
      service = new ShardMoveService(
        prisma,
        new ShardMapSync(prisma),
        undefined,
        pool,
        {
          batchSize: 7, // many small batches: exercises the cursors
          catchupThreshold: 2,
          freezeMs: 20_000,
        },
      );
    });

    afterAll(async () => {
      for (const m of mapBefore) {
        await raw.primary.shardMap.updateMany({
          where: {
            logical_shard: m.logical_shard,
            OR: [
              { physical_db: { not: m.physical_db } },
              { state: { not: m.state } },
            ],
          },
          data: { physical_db: m.physical_db, state: m.state },
        });
      }
      await service.close();
      await Promise.all(Object.values(raw).map((c) => c.$disconnect()));
      await prisma.onModuleDestroy();
      log.mockRestore();
    });

    const otherDb = (from: string) => (from === 'primary' ? 'db1' : 'primary');

    const enqueue = async (to: string, shards: number[]) => {
      const out = [];
      for (const s of shards)
        out.push(await service.runner().enqueue(s, to, null));
      return out;
    };

    async function seedShard(shard: number, rows: number) {
      const userId = userWithShard(shard);
      await prisma
        .global()
        .user.create({ data: { id: userId, role: 'client' } });
      for (let i = 0; i < rows; i++) await notify(userId, shard);
      return userId;
    }

    it('dry run: preflight and plan, nothing is written', async () => {
      const shard = shards[0];
      await seedShard(shard, 3);
      const from = physical().physicalFor(shard);
      const movesBefore = await raw.primary.shardMove.count();
      const plan = await service.dryRun(shard, otherDb(from));
      // The reasons first: a refused preflight says WHY, not just `false`.
      expect(plan.problems).toEqual([]);
      expect(plan.ok).toBe(true);
      expect(plan.fromDb).toBe(from);
      expect(plan.totalRows).toBeGreaterThanOrEqual(3);
      expect(plan.estimatedSeconds).toBeGreaterThan(0);
      // Nothing written: the table is exactly as it was before the dry run.
      expect(await raw.primary.shardMove.count()).toBe(movesBefore);
      expect(await remainingCrossFamilyForeignKeys(pool.get('db1'))).toBe(0);
    });

    it('moves a shard with concurrent writes: nothing lost, verified, flipped, cleaned up', async () => {
      const shard = shards[1];
      const userId = await seedShard(shard, 25);
      const from = physical().physicalFor(shard);
      const to = otherDb(from);
      const [move] = await enqueue(to, [shard]);

      // A writer that never stops until the move is finished.
      let stop = false;
      let acked = 0;
      let refused = 0;
      const writer = (async () => {
        while (!stop) {
          try {
            await notify(userId, shard);
            acked += 1;
          } catch (e) {
            if (/frozen for a move|55P03/.test(String(e))) refused += 1;
            else throw e;
          }
          await new Promise((r) => setTimeout(r, 5));
        }
      })();

      const done = await service.runner().run(move.id);
      // Keep writing after the flip, now to the new database.
      await new Promise((r) => setTimeout(r, 300));
      stop = true;
      await writer;

      expect(outcome(done)).toMatchObject({ status: 'waiting', error: null });
      expect(done.progress.verify?.ok).toBe(true);
      expect(physical().physicalFor(shard)).toBe(to);
      const map = await raw.primary.shardMap.findUnique({
        where: { logical_shard: shard },
      });
      expect(map).toMatchObject({ physical_db: to, state: 'active' });

      const total = 25 + acked;
      // Every acknowledged write is on the new database; reads go there.
      expect(await countOn(to, userId)).toBe(total);
      expect(
        await shardContext.run(shard, () =>
          prisma.notification.count({ where: { user_id: userId } }),
        ),
      ).toBe(total);
      expect(acked).toBeGreaterThan(0);
      // The old copy is kept (7 days) but fenced against stale writers.
      expect(await countOn(from, userId)).toBeGreaterThan(0);
      await expect(
        raw[from].notification.create({
          data: {
            user_id: userId,
            type: 'contact_joined',
            category: 'messages',
            payload: {},
            shard_id: shard,
          },
        }),
      ).rejects.toThrow(/frozen for a move/);
      void refused;

      // Cleanup refuses before the deadline, forced cleanup removes the old rows only.
      await expect(service.runner().cleanup(move.id)).rejects.toThrow(
        /kept until/,
      );
      const cleaned = await service.runner().cleanup(move.id, { force: true });
      expect(cleaned.status).toBe('done');
      expect(await countOn(from, userId)).toBe(0);
      expect(await countOn(to, userId)).toBe(total);
      // Triggers are gone once nothing is tracked.
      const trg = await raw[from].$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM pg_trigger WHERE tgname LIKE '%\\_shard\\_move'`,
      );
      expect(trg[0].n).toBe(0);
    });

    it('rollback before the flip leaves the shard untouched', async () => {
      const shard = shards[2];
      const userId = await seedShard(shard, 9);
      const from = physical().physicalFor(shard);
      const to = otherDb(from);
      const [move] = await enqueue(to, [shard]);

      // A runner whose verification always fails: the move stops before the flip.
      class BadVerify extends PgMoveOps {
        override async verify() {
          const v = await super.verify(shard);
          return { ...v, ok: false };
        }
      }
      const bad = new ShardMoveRunner({
        store: service.store,
        lease: new MemoryMoveLease(),
        sync: { invalidate: async () => undefined },
        opsFor: (f, t) => new BadVerify(pool.get(f), pool.get(t)),
        options: { batchSize: 4, catchupThreshold: 1 },
      });
      const failed = await bad.run(move.id);
      // It failed for the intended reason (verification), not an earlier step.
      expect(outcome(failed)).toMatchObject({
        status: 'failed',
        state: 'verify',
        error: expect.stringMatching(/verif/i) as string,
      });
      expect(await countOn(to, userId)).toBe(9); // the copy exists

      const rolled = await service.rollback(move.id);
      expect(rolled.status).toBe('rolled_back');
      expect(await countOn(to, userId)).toBe(0);
      expect(await countOn(from, userId)).toBe(9);
      expect(physical().physicalFor(shard)).toBe(from);
      // Writers are not blocked any more.
      await notify(userId, shard);
      expect(await countOn(from, userId)).toBe(10);
    });

    it('rollback after the flip replays the new writes back to the old database', async () => {
      const shard = shards[3];
      const userId = await seedShard(shard, 6);
      const from = physical().physicalFor(shard);
      const to = otherDb(from);
      const [move] = await enqueue(to, [shard]);
      const done = await service.runner().run(move.id);
      expect(outcome(done)).toMatchObject({ status: 'waiting', error: null });
      await notify(userId, shard);
      await notify(userId, shard);
      expect(await countOn(to, userId)).toBe(8);

      const rolled = await service.rollback(move.id);
      expect(rolled.status).toBe('rolled_back');
      expect(rolled.leftoverDb).toBe(to);
      expect(physical().physicalFor(shard)).toBe(from);
      expect(await countOn(from, userId)).toBe(8);
      await notify(userId, shard);
      expect(await countOn(from, userId)).toBe(9);
      // The abandoned copy is fenced, then removed by the cleanup.
      await service.runner().cleanup(move.id, { force: true });
      expect(await countOn(to, userId)).toBe(0);
    });

    it('refuses a second move of the same shard and a move to its own database', async () => {
      const shard = shards[4];
      await seedShard(shard, 1);
      const from = physical().physicalFor(shard);
      await expect(enqueue(from, [shard])).rejects.toThrow(/already on/);
    });

    it('the orphan checker sees a notification whose user is gone', async () => {
      const shard = shards[5];
      const userId = await seedShard(shard, 1);
      await raw.primary
        .$executeRawUnsafe(`DELETE FROM users WHERE id = '${userId}'::uuid`)
        .catch(() => undefined);
      const report = await new OrphanChecker(undefined, pool).run({
        pageSize: 50,
      });
      const hit = report.edges.filter(
        (e) => e.edge.startsWith('notifications.user_id') && e.orphans > 0,
      );
      expect(hit.length).toBeGreaterThan(0);
      expect(report.totalOrphans).toBeGreaterThan(0);
    });
  },
);
