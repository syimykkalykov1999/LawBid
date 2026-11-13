import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { claimChatSendSlot } from '../src/modules/chat/chat-send-bookkeeping';

/**
 * The one statement of a send that takes the chat row lock (row 82): it
 * numbers the message, does the bookkeeping the three Prisma calls of
 * 2026-11-02 did, and returns the locked row — on real PostgreSQL.
 */
describe('chat send bookkeeping (e2e)', () => {
  jest.setTimeout(60_000);
  const prisma = new PrismaClient();
  afterAll(() => prisma.$disconnect());

  async function chat(status: 'active' | 'closed' = 'active') {
    const att = await prisma.user.create({ data: { role: 'attorney' } });
    const cli = await prisma.user.create({ data: { role: 'client' } });
    const conv = await prisma.conversation.create({
      data: {
        attorney_id: att.id,
        client_id: cli.id,
        status,
        participants: { create: [{ user_id: att.id }, { user_id: cli.id }] },
      },
    });
    return { conv, att, cli };
  }

  /** What ChatService.send does inside its transaction, in the same order. */
  function send(conversationId: string, senderId: string, body: string) {
    const id = randomUUID();
    return prisma.$transaction(
      async (tx) => {
        const slot = await claimChatSendSlot(
          tx,
          { conversationId, messageId: id },
          senderId,
        );
        if (!slot) return null;
        return tx.message.create({
          data: {
            id,
            conversation_id: conversationId,
            shard_id: slot.shard_id,
            seq: slot.seq,
            created_at: slot.created_at,
            sender_id: senderId,
            type: 'text',
            body_original: body,
            body_display: body,
            client_message_id: randomUUID(),
          },
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  it('moves the last message, revives a removed chat for both, marks only the sender as read', async () => {
    const { conv, att, cli } = await chat();
    const gone = new Date('2026-01-01T00:00:00Z');
    await prisma.conversationParticipant.updateMany({
      where: { conversation_id: conv.id },
      data: { hidden_at: gone },
    });
    const m = (await send(conv.id, cli.id, 'hi'))!;
    expect(m.seq).toBe(1);
    const c = await prisma.conversation.findUniqueOrThrow({
      where: { id: conv.id },
    });
    expect(c.last_seq).toBe(1);
    expect(c.last_message_id).toBe(m.id);
    expect(c.last_message_at?.getTime()).toBe(m.created_at.getTime());
    const rows = await prisma.conversationParticipant.findMany({
      where: { conversation_id: conv.id },
    });
    const mine = rows.find((r) => r.user_id === cli.id)!;
    const theirs = rows.find((r) => r.user_id === att.id)!;
    expect(mine.hidden_at).toBeNull();
    expect(theirs.hidden_at).toBeNull();
    expect(mine.last_read_message_id).toBe(m.id);
    expect(mine.last_read_at).not.toBeNull();
    expect(theirs.last_read_message_id).toBeNull();
    expect(theirs.last_read_at).toBeNull();
  });

  it("leaves a visible chat's other side untouched and never touches other chats", async () => {
    const a = await chat();
    const b = await chat();
    const before = await prisma.conversationParticipant.findUniqueOrThrow({
      where: {
        conversation_id_user_id: {
          conversation_id: a.conv.id,
          user_id: a.cli.id,
        },
      },
    });
    await send(a.conv.id, a.att.id, 'x');
    const after = await prisma.conversationParticipant.findUniqueOrThrow({
      where: {
        conversation_id_user_id: {
          conversation_id: a.conv.id,
          user_id: a.cli.id,
        },
      },
    });
    expect(after.updated_at.getTime()).toBe(before.updated_at.getTime());
    const other = await prisma.conversation.findUniqueOrThrow({
      where: { id: b.conv.id },
    });
    expect(other.last_message_id).toBeNull();
    expect(other.last_seq).toBe(0);
  });

  it('a sender who is not a participant aborts the send (nothing half-written)', async () => {
    const { conv } = await chat();
    const stranger = await prisma.user.create({ data: { role: 'client' } });
    await expect(send(conv.id, stranger.id, 'x')).rejects.toThrow(
      'no participant row',
    );
    const c = await prisma.conversation.findUniqueOrThrow({
      where: { id: conv.id },
    });
    expect(c.last_seq).toBe(0);
    expect(c.last_message_id).toBeNull();
    expect(
      await prisma.message.count({ where: { conversation_id: conv.id } }),
    ).toBe(0);
  });

  it('a closed chat gives no slot and changes nothing', async () => {
    const { conv, cli } = await chat('closed');
    expect(await send(conv.id, cli.id, 'x')).toBeNull();
    const c = await prisma.conversation.findUniqueOrThrow({
      where: { id: conv.id },
    });
    expect(c.last_seq).toBe(0);
    expect(c.last_message_id).toBeNull();
  });

  it('concurrent sends in one chat get 1..N without holes, and the last message is the highest number', async () => {
    const { conv, att, cli } = await chat();
    const sent = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        send(conv.id, i % 2 ? att.id : cli.id, `m${i}`),
      ),
    );
    const seqs = sent.map((m) => m!.seq).sort((a, b) => a! - b!);
    expect(seqs).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    const c = await prisma.conversation.findUniqueOrThrow({
      where: { id: conv.id },
    });
    expect(c.last_seq).toBe(20);
    expect(c.last_message_id).toBe(sent.find((m) => m!.seq === 20)!.id);
    // The trigger still numbers the other write paths after these.
    const sys = await prisma.message.create({
      data: {
        id: randomUUID(),
        conversation_id: conv.id,
        sender_id: null,
        type: 'text',
        body_original: 'call',
        body_display: 'call',
        client_message_id: randomUUID(),
      },
    });
    expect(sys.seq).toBe(21);
  });
});
