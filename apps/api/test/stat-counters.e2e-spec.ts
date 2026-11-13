import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

/**
 * Row 78 (1B messages): the admin overview's «messages in 7 days» and «users
 * by role» read `stat_counters`, kept by triggers in the same transaction as
 * every write (migration 20261128110000_stat_counters). Real PostgreSQL,
 * plain Prisma client. Other suites write messages and users at the same
 * time, so every whole-table check compares the counters and COUNT(*) in ONE
 * statement (one snapshot); per-hour checks use an hour of the year 2001
 * that only this suite writes to.
 */
describe('stat_counters (e2e)', () => {
  jest.setTimeout(60_000);
  const prisma = new PrismaClient();

  afterAll(() => prisma.$disconnect());

  /** Counters vs COUNT(*), whole tables, one snapshot. */
  async function drift() {
    const [row] = await prisma.$queryRaw<
      {
        counted: bigint;
        real: bigint;
        clients: bigint;
        real_clients: bigint;
        attorneys: bigint;
        real_attorneys: bigint;
      }[]
    >`
      SELECT
        (SELECT COALESCE(SUM(n), 0) FROM stat_counters WHERE metric = 'messages')::bigint AS counted,
        (SELECT count(*) FROM messages WHERE deleted_at IS NULL)::bigint AS real,
        (SELECT COALESCE(SUM(n), 0) FROM stat_counters WHERE metric = 'users.live.client')::bigint AS clients,
        (SELECT count(*) FROM users WHERE role = 'client' AND deleted_at IS NULL)::bigint AS real_clients,
        (SELECT COALESCE(SUM(n), 0) FROM stat_counters WHERE metric = 'users.live.attorney')::bigint AS attorneys,
        (SELECT count(*) FROM users WHERE role = 'attorney' AND deleted_at IS NULL)::bigint AS real_attorneys`;
    return {
      messages: [Number(row.counted), Number(row.real)],
      clients: [Number(row.clients), Number(row.real_clients)],
      attorneys: [Number(row.attorneys), Number(row.real_attorneys)],
    };
  }

  async function expectNoDrift() {
    const d = await drift();
    expect(d.messages[0]).toBe(d.messages[1]);
    expect(d.clients[0]).toBe(d.clients[1]);
    expect(d.attorneys[0]).toBe(d.attorneys[1]);
  }

  /** The counter of one UTC hour vs COUNT(*) of that hour. */
  async function hour(at: Date) {
    const [row] = await prisma.$queryRaw<{ counted: bigint; real: bigint }[]>`
      SELECT
        (SELECT COALESCE(SUM(n), 0) FROM stat_counters
          WHERE metric = 'messages' AND bucket = date_trunc('hour', ${at}::timestamptz, 'UTC'))::bigint AS counted,
        (SELECT count(*) FROM messages WHERE deleted_at IS NULL
          AND created_at >= date_trunc('hour', ${at}::timestamptz, 'UTC')
          AND created_at < date_trunc('hour', ${at}::timestamptz, 'UTC') + interval '1 hour')::bigint AS real`;
    return [Number(row.counted), Number(row.real)];
  }

  async function chat() {
    const att = await prisma.user.create({
      data: { role: 'attorney', first_name: 'Cnt', last_name: 'A' },
    });
    const cli = await prisma.user.create({
      data: { role: 'client', first_name: 'Cnt', last_name: 'C' },
    });
    const conv = await prisma.conversation.create({
      data: {
        attorney_id: att.id,
        client_id: cli.id,
        status: 'active',
        participants: { create: [{ user_id: att.id }, { user_id: cli.id }] },
      },
    });
    return { conv, cli };
  }

  const msg = (conversation_id: string, sender_id: string, at?: Date) => ({
    conversation_id,
    sender_id,
    type: 'text' as const,
    body_original: 'x',
    body_display: 'x',
    client_message_id: randomUUID(),
    ...(at ? { created_at: at } : {}),
  });

  it('messages: insert, bulk insert, soft delete, restore, delete, rollback', async () => {
    const { conv, cli } = await chat();
    // An hour nobody else writes to: 2001-01-01 + a random hour.
    const at = new Date(
      Date.UTC(2001, 0, 1) + Math.floor(Math.random() * 8000) * 3_600_000,
    );
    const later = new Date(at.getTime() + 25 * 60_000);
    expect(await hour(at)).toEqual([0, 0]);

    const one = await prisma.message.create({ data: msg(conv.id, cli.id, at) });
    await prisma.message.createMany({
      data: [
        msg(conv.id, cli.id, at),
        msg(conv.id, cli.id, later),
        msg(conv.id, cli.id, later),
      ],
    });
    expect(await hour(at)).toEqual([4, 4]);

    // Soft delete and restore (the overview counts live messages only).
    await prisma.message.updateMany({
      where: { id: one.id },
      data: { deleted_at: new Date() },
    });
    expect(await hour(at)).toEqual([3, 3]);
    // A second soft-delete stamp changes nothing.
    await prisma.message.updateMany({
      where: { id: one.id },
      data: { deleted_at: new Date() },
    });
    expect(await hour(at)).toEqual([3, 3]);
    await prisma.message.updateMany({
      where: { id: one.id },
      data: { deleted_at: null },
    });
    expect(await hour(at)).toEqual([4, 4]);

    // Moving created_at moves the count to the other hour.
    const next = new Date(at.getTime() + 3_600_000);
    await prisma.message.updateMany({
      where: { id: one.id },
      data: { created_at: next },
    });
    expect(await hour(at)).toEqual([3, 3]);
    expect(await hour(next)).toEqual([1, 1]);

    // A rolled-back send leaves the counter as it was.
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.message.create({ data: msg(conv.id, cli.id, at) });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await hour(at)).toEqual([3, 3]);

    // Hard delete (one statement, several rows).
    await prisma.message.deleteMany({ where: { conversation_id: conv.id } });
    expect(await hour(at)).toEqual([0, 0]);
    expect(await hour(next)).toEqual([0, 0]);
    await expectNoDrift();
  });

  it('users: sign-up, role change, soft delete, delete', async () => {
    const u = await prisma.user.create({
      data: { first_name: 'Cnt', last_name: 'NoRole' },
    });
    await expectNoDrift();
    await prisma.user.update({ where: { id: u.id }, data: { role: 'client' } });
    await expectNoDrift();
    await prisma.user.update({
      where: { id: u.id },
      data: { role: 'attorney' },
    });
    await expectNoDrift();
    await prisma.user.update({
      where: { id: u.id },
      data: { deleted_at: new Date() },
    });
    await expectNoDrift();
    await prisma.user.update({
      where: { id: u.id },
      data: { deleted_at: null, first_name: 'Back' },
    });
    await expectNoDrift();
    await prisma.user.delete({ where: { id: u.id } });
    await expectNoDrift();
  });

  it('the app role (prod connects as lawbid_app) can write through the triggers', async () => {
    const { conv, cli } = await chat();
    const rollback = new Error('rollback on purpose');
    let sent = 0;
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL ROLE lawbid_app');
        sent = await tx.$executeRaw`
          INSERT INTO messages (conversation_id, sender_id, type, body_original, body_display, client_message_id, updated_at)
          VALUES (${conv.id}::uuid, ${cli.id}::uuid, 'text', 'x', 'x', ${randomUUID()}, now())`;
        await tx.$executeRaw`
          INSERT INTO users (first_name, last_name, role, updated_at) VALUES ('Cnt', 'App', 'client', now())`;
        throw rollback;
      }),
    ).rejects.toBe(rollback);
    expect(sent).toBe(1);
    await expectNoDrift();
  });
});
