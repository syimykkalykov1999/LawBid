import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

/**
 * Per-chat message numbers (migration 20261109090000_message_seq): the
 * BEFORE INSERT trigger numbers every message 1, 2, 3, ... of its chat, with
 * no application code involved. Real PostgreSQL, plain Prisma client.
 */
describe('message seq (e2e)', () => {
  jest.setTimeout(60_000);
  const prisma = new PrismaClient();

  async function chat() {
    const att = await prisma.user.create({
      data: { role: 'attorney', first_name: 'Seq', last_name: 'A' },
    });
    const cli = await prisma.user.create({
      data: { role: 'client', first_name: 'Seq', last_name: 'C' },
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

  const send = (
    db: Pick<PrismaClient, 'message'>,
    conversation_id: string,
    sender_id: string,
    n: string,
  ) =>
    db.message.create({
      data: {
        conversation_id,
        sender_id,
        type: 'text',
        body_original: n,
        body_display: n,
        client_message_id: `${n}-${randomUUID()}`,
      },
    });

  afterAll(() => prisma.$disconnect());

  it('numbers messages 1..N, also when sent concurrently', async () => {
    const { conv, cli } = await chat();
    const first = await send(prisma, conv.id, cli.id, 'a');
    expect(first.seq).toBe(1);
    const batch = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        send(prisma, conv.id, cli.id, `c${i}`),
      ),
    );
    const seqs = batch.map((m) => m.seq).sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(seqs).toEqual(Array.from({ length: 20 }, (_, i) => i + 2));
    const row = await prisma.conversation.findUniqueOrThrow({
      where: { id: conv.id },
    });
    expect(row.last_seq).toBe(21);
  });

  it('chats count independently; a rolled-back send leaves no hole', async () => {
    const one = await chat();
    const two = await chat();
    await send(prisma, one.conv.id, one.cli.id, 'x');
    expect((await send(prisma, two.conv.id, two.cli.id, 'y')).seq).toBe(1);
    await expect(
      prisma.$transaction(async (tx) => {
        await send(tx, one.conv.id, one.cli.id, 'lost');
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect((await send(prisma, one.conv.id, one.cli.id, 'z')).seq).toBe(2);
  });

  it('createMany is numbered too (demo seed, imports)', async () => {
    const { conv, cli } = await chat();
    await prisma.message.createMany({
      data: ['p', 'q', 'r'].map((n) => ({
        conversation_id: conv.id,
        sender_id: cli.id,
        type: 'text' as const,
        body_original: n,
        body_display: n,
        client_message_id: `${n}-${randomUUID()}`,
      })),
    });
    const rows = await prisma.message.findMany({
      where: { conversation_id: conv.id },
      orderBy: { seq: 'asc' },
    });
    expect(rows.map((r) => r.seq)).toEqual([1, 2, 3]);
  });
});
