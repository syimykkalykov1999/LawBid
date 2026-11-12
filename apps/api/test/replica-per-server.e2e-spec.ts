import { PrismaReadService } from '../src/prisma/prisma-read.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { shardContext } from '../src/sharding/shard-context';
import { expectedPhysicalDb } from './support/e2e-two-db';

/**
 * Owner 2026-11-11: with extra database servers each data part is read from
 * the read copy of ITS server (before: the copy was switched off as soon as
 * a second server existed). Here the "copies" are the servers themselves, so
 * the test shows the routing: a row that lives on the second server is found
 * through the read client, which is no longer the primary client. In the
 * one-database e2e run it only checks that nothing changes.
 */
describe('read copies per server (real PostgreSQL)', () => {
  const twoDb = !!process.env.DATABASE_URL_SHARDS;
  const saved = { ...process.env };
  const prisma = new PrismaService();
  let read: PrismaReadService;
  let userId: string;

  beforeAll(async () => {
    process.env.DATABASE_REPLICA_URL = process.env.DATABASE_URL;
    await prisma.onModuleInit();
    read = new PrismaReadService(prisma);
    await (read as unknown as { buildRouted(): Promise<void> }).buildRouted();
    userId = (await prisma.global().user.create({ data: { role: 'client' } }))
      .id;
  });

  afterAll(async () => {
    await read.onModuleDestroy();
    await prisma.onModuleDestroy();
    process.env = { ...saved };
  });

  it('a row on the second server is read through the copy of that server', async () => {
    const row = await shardContext.run(1, () =>
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
    const found = await shardContext.run(1, () =>
      read.db.notification.findFirst({
        where: { id: row.id },
        select: { id: true },
      }),
    );
    expect(found?.id).toBe(row.id);
    if (twoDb && expectedPhysicalDb(1) === 'db1') {
      expect(read.db).not.toBe(prisma);
      expect(read.usingReplica).toBe(true);
    }
  });
});
