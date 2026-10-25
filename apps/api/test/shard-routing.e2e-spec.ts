import { PrismaClient } from '@prisma/client';
import { expectedPhysicalDb } from './support/e2e-two-db';
import { PrismaService, routingOf } from '../src/prisma/prisma.service';
import { shardContext } from '../src/sharding/shard-context';
import { hashShard, newShardedId } from '../src/sharding/shard-id';
import { shardStats } from '../src/sharding/shard-stats';

/**
 * Shard-ready steps 3 to 5: the router and the per-database clients on real
 * PostgreSQL. In the normal e2e run there is one database and every
 * expectation below degrades to "it all lands in the same place". With
 * `E2E_TWO_DB=1|all` (scripts/run-e2e-two-db.mjs) some or all logical shards
 * live in a second database and the rows must really end up there.
 */
describe('shard routing (real PostgreSQL)', () => {
  const twoDb = !!process.env.DATABASE_URL_SHARDS;
  const prisma = new PrismaService();
  const primaryRaw = new PrismaClient();
  const shardsUrl = process.env.DATABASE_URL_SHARDS
    ? (JSON.parse(process.env.DATABASE_URL_SHARDS) as Record<string, string>)
    : {};
  const db1Raw = twoDb
    ? new PrismaClient({ datasourceUrl: shardsUrl.db1 })
    : primaryRaw;
  let userId: string;

  beforeAll(async () => {
    await prisma.onModuleInit();
    userId = (await prisma.global().user.create({ data: { role: 'client' } }))
      .id;
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
    await primaryRaw.$disconnect();
    if (twoDb) await db1Raw.$disconnect();
  });

  const notify = () =>
    prisma.notification.create({
      data: {
        user_id: userId,
        type: 'contact_joined',
        category: 'messages',
        payload: {},
      },
      select: { id: true },
    });

  const onlyIn = (db: 'primary' | 'db1') =>
    db === 'db1' ? { primary: 0, db1: 1 } : { primary: 1, db1: 0 };

  const where = async (id: string) => ({
    primary: await primaryRaw.notification.count({ where: { id } }),
    db1: twoDb ? await db1Raw.notification.count({ where: { id } }) : 0,
  });

  it('loads shard_map: as the two-DB mode says (see e2e-two-db.ts)', () => {
    const router = routingOf(prisma).router;
    expect(router.physicalFor(1)).toBe(expectedPhysicalDb(1));
    expect(router.physicalFor(2)).toBe(expectedPhysicalDb(2));
    expect(router.forCase(newShardedId(3))).toBe(expectedPhysicalDb(3));
  });

  it('a sharded row is written to the database of the shard context', async () => {
    const odd = await shardContext.run(1, notify);
    const even = await shardContext.run(2, notify);
    expect(await where(odd.id)).toEqual(onlyIn(expectedPhysicalDb(1)));
    expect(await where(even.id)).toEqual(onlyIn(expectedPhysicalDb(2)));
  });

  it('without a context a create goes to the database of the owner it names', async () => {
    const row = await notify();
    expect(await where(row.id)).toEqual(
      onlyIn(expectedPhysicalDb(hashShard(userId))),
    );
  });

  it('without a context a query that names nothing and cannot be merged uses the primary database (and is counted)', async () => {
    shardStats.drain();
    await prisma.notification.groupBy({ by: ['type'], _count: true });
    expect(shardStats.drain()?.byModel.Notification).toBe(1);
  });

  it('global models ignore the context', async () => {
    const found = await shardContext.run(1, () =>
      prisma.user.findUnique({ where: { id: userId } }),
    );
    expect(found?.id).toBe(userId);
  });

  it('explicit routing matches the context routing', async () => {
    const viaClient = await prisma.forShard(1).notification.create({
      data: {
        user_id: userId,
        type: 'contact_joined',
        category: 'messages',
        payload: {},
      },
      select: { id: true },
    });
    expect(await where(viaClient.id)).toEqual(onlyIn(expectedPhysicalDb(1)));
    expect(prisma.forShard(2) === prisma.global()).toBe(
      expectedPhysicalDb(2) === 'primary',
    );
  });
});
