import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaService, routingOf } from '../src/prisma/prisma.service';
import { shardContext } from '../src/sharding/shard-context';
import {
  CrossFamilyOutbox,
  MAX_ATTEMPTS,
  OutboxTicket,
  backoffSeconds,
} from '../src/sharding/outbox/cross-family-outbox';
import {
  EFFECTS,
  registerAfterCommitEffect,
} from '../src/sharding/outbox/outbox-effects';
import { pgAdapter } from '../src/prisma/pg-adapter';

/**
 * Shard-ready step 7 on real PostgreSQL. One database: the effect runs
 * inline in the caller's transaction and nothing is stored (identical to
 * the code before the outbox). Two databases (E2E_TWO_DB=all): the event is
 * stored on the shard's database in the same transaction, applied exactly
 * once on the global side, retried with backoff and dead-lettered.
 */
describe('cross-family outbox (real PostgreSQL)', () => {
  const twoDb = !!process.env.DATABASE_URL_SHARDS;
  const prisma = new PrismaService();
  const outbox = new CrossFamilyOutbox(prisma);
  const primaryRaw = new PrismaClient({
    adapter: pgAdapter(process.env.DATABASE_URL),
  });
  const shardsUrl = twoDb
    ? (JSON.parse(process.env.DATABASE_URL_SHARDS!) as Record<string, string>)
    : {};
  const db1Raw = twoDb
    ? new PrismaClient({ adapter: pgAdapter(shardsUrl.db1) })
    : primaryRaw;
  let userId: string;
  const effects = EFFECTS as Record<string, unknown>;

  beforeAll(async () => {
    await prisma.onModuleInit();
    userId = (await prisma.global().user.create({ data: { role: 'client' } }))
      .id;
  });
  afterAll(async () => {
    delete effects['test.fail'];
    await prisma.onApplicationShutdown();
    await primaryRaw.$disconnect();
    if (twoDb) await db1Raw.$disconnect();
  });

  const consents = () =>
    primaryRaw.userConsent.count({ where: { user_id: userId } });
  const stored = (key: string) =>
    db1Raw.$queryRaw<
      { status: string; attempts: number; last_error: string | null }[]
    >`SELECT status, attempts, last_error FROM cross_family_outbox
      WHERE idempotency_key = ${key}`;

  const emitConsent = (key: string) => {
    const tickets: Array<OutboxTicket | null> = [];
    return shardContext
      .runForUser(userId, () =>
        prisma.$transaction(async (tx) => {
          tickets.push(
            await outbox.emit(
              tx,
              'user.consent.record',
              {
                userId,
                consentType: 'client_contact_sharing',
                ip: null,
                deviceId: null,
              },
              key,
            ),
          );
        }),
      )
      .then(() => tickets);
  };

  it('applies the effect once; stored only when the transaction is not on the primary database', async () => {
    const key = `consent:${randomUUID()}`;
    const before = await consents();
    const tickets = await emitConsent(key);
    if (!twoDb) {
      // Inline: already applied inside the transaction, nothing stored.
      expect(tickets).toEqual([null]);
      expect(await consents()).toBe(before + 1);
      expect(await stored(key)).toEqual([]);
      return;
    }
    // The shard database holds the pending event, the global one nothing yet.
    expect(await stored(key)).toMatchObject([{ status: 'pending' }]);
    expect(await consents()).toBe(before);
    await outbox.flush(tickets);
    expect(await consents()).toBe(before + 1);
    expect(await stored(key)).toMatchObject([{ status: 'done' }]);
    // The same key again (a retried request) stores and applies nothing new.
    await outbox.flush(await emitConsent(key));
    expect(await consents()).toBe(before + 1);
  });

  it('a duplicate delivery of an applied event is skipped (inbox)', async () => {
    if (!twoDb) return;
    const key = `consent:${randomUUID()}`;
    const before = await consents();
    await outbox.flush(await emitConsent(key));
    expect(await consents()).toBe(before + 1);
    // Simulate "marked done was lost": the row is pending again.
    await db1Raw.$executeRaw`UPDATE cross_family_outbox
      SET status = 'pending', next_attempt_at = now() WHERE idempotency_key = ${key}`;
    const r = await outbox.sweep();
    expect(r.applied).toBeGreaterThanOrEqual(1);
    expect(await consents()).toBe(before + 1);
    expect(await stored(key)).toMatchObject([{ status: 'done' }]);
  });

  it('retries with backoff and dead-letters after MAX_ATTEMPTS; retryDead re-queues', async () => {
    if (!twoDb) return;
    let fail = true;
    effects['test.fail'] = () =>
      fail ? Promise.reject(new Error('boom')) : Promise.resolve();
    const key = `fail:${randomUUID()}`;
    await shardContext.runForUser(userId, () =>
      prisma.$transaction(async (tx) => {
        await outbox.emit(tx, 'test.fail', {}, key);
      }),
    );
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      await db1Raw.$executeRaw`UPDATE cross_family_outbox
        SET next_attempt_at = now() WHERE idempotency_key = ${key}`;
      await outbox.sweep();
    }
    const [dead] = await stored(key);
    expect(dead).toMatchObject({ status: 'dead', attempts: MAX_ATTEMPTS });
    expect(dead.last_error).toContain('boom');
    // A pending row that failed once waits (backoff), it is not hot-looped.
    expect(backoffSeconds(1)).toBe(5);
    expect(backoffSeconds(30)).toBe(3600);
    fail = false;
    expect(await outbox.retryDead()).toBeGreaterThanOrEqual(1);
    await outbox.sweep();
    expect((await stored(key))[0].status).toBe('done');
  });

  // THIRD_PASS_A X1 (26.11): after-commit effects (queue a job) are always
  // stored, never run inside the transaction, and survive a lost flush.
  describe('after-commit effects', () => {
    const runs: string[] = [];
    let failAfter = false;
    beforeAll(() => {
      registerAfterCommitEffect('test.after', (p: { id: string }) => {
        if (failAfter) return Promise.reject(new Error('queue down'));
        runs.push(p.id);
        return Promise.resolve();
      });
    });

    const emitAfter = (id: string, key: string) => {
      let ticket: OutboxTicket | null = null;
      return shardContext
        .runForUser(userId, () =>
          prisma.$transaction(async (tx) => {
            ticket = await outbox.emit(tx, 'test.after', { id }, key);
            // Inside the transaction nothing ran yet, on any database.
            expect(runs).not.toContain(id);
          }),
        )
        .then(() => ticket);
    };

    it('stores the row in the transaction and runs it once after the commit', async () => {
      const id = randomUUID();
      const key = `after:${id}`;
      const ticket = await emitAfter(id, key);
      expect(ticket).not.toBeNull();
      expect(await stored(key)).toMatchObject([{ status: 'pending' }]);
      await outbox.flush([ticket]);
      expect(runs.filter((r) => r === id)).toHaveLength(1);
      expect(await stored(key)).toMatchObject([{ status: 'done' }]);
      // A second flush of the same ticket runs nothing (no pending row).
      await outbox.flush([ticket]);
      expect(runs.filter((r) => r === id)).toHaveLength(1);
    });

    it('a flush that never happened (crash after the commit) is run by the sweep', async () => {
      const id = randomUUID();
      const key = `after:${id}`;
      await emitAfter(id, key);
      // Leased for the in-process flush: the sweep leaves it alone first.
      await outbox.sweep();
      expect(runs).not.toContain(id);
      await db1Raw.$executeRaw`UPDATE cross_family_outbox
        SET next_attempt_at = now() WHERE idempotency_key = ${key}`;
      await outbox.sweep();
      expect(runs.filter((r) => r === id)).toHaveLength(1);
      expect(await stored(key)).toMatchObject([{ status: 'done' }]);
    });

    it('a failed run stays pending with backoff and is retried', async () => {
      const id = randomUUID();
      const key = `after:${id}`;
      failAfter = true;
      const ticket = await emitAfter(id, key);
      await outbox.flush([ticket]);
      const [row] = await stored(key);
      expect(row).toMatchObject({ status: 'pending', attempts: 1 });
      expect(row.last_error).toContain('queue down');
      failAfter = false;
      await db1Raw.$executeRaw`UPDATE cross_family_outbox
        SET next_attempt_at = now() WHERE idempotency_key = ${key}`;
      await outbox.sweep();
      expect(runs.filter((r) => r === id)).toHaveLength(1);
      expect(await stored(key)).toMatchObject([{ status: 'done' }]);
    });
  });

  it('knows its databases', () => {
    expect(routingOf(prisma)).toBeDefined();
  });
});
