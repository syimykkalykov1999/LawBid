import { PrismaClient } from '../src/generated/prisma/client';
import { randomUUID } from 'node:crypto';
import { recordSentMessage } from '../src/modules/chat/chat-send-bookkeeping';
import { pgAdapter } from '../src/prisma/pg-adapter';

/**
 * The one-statement bookkeeping of a sent message (load test 2026-11-02):
 * same effect as the three Prisma calls it replaced, on real PostgreSQL.
 */
describe('chat send bookkeeping (e2e)', () => {
  jest.setTimeout(60_000);
  const prisma = new PrismaClient({
    adapter: pgAdapter(process.env.DATABASE_URL),
  });
  afterAll(() => prisma.$disconnect());

  async function chat() {
    const att = await prisma.user.create({ data: { role: 'attorney' } });
    const cli = await prisma.user.create({ data: { role: 'client' } });
    const conv = await prisma.conversation.create({
      data: {
        attorney_id: att.id,
        client_id: cli.id,
        status: 'active',
        participants: { create: [{ user_id: att.id }, { user_id: cli.id }] },
      },
    });
    return { conv, att, cli };
  }

  it('moves the last message, revives a removed chat for both, marks only the sender as read', async () => {
    const { conv, att, cli } = await chat();
    const gone = new Date('2026-01-01T00:00:00Z');
    await prisma.conversationParticipant.updateMany({
      where: { conversation_id: conv.id },
      data: { hidden_at: gone },
    });
    const m = await prisma.message.create({
      data: {
        id: randomUUID(),
        conversation_id: conv.id,
        sender_id: cli.id,
        type: 'text',
        body_original: 'hi',
        body_display: 'hi',
        client_message_id: randomUUID(),
      },
    });
    await prisma.$transaction((tx) =>
      recordSentMessage(
        tx,
        { conversationId: conv.id, messageId: m.id, createdAt: m.created_at },
        cli.id,
      ),
    );
    const c = await prisma.conversation.findUniqueOrThrow({
      where: { id: conv.id },
    });
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
    const m = await prisma.message.create({
      data: {
        id: randomUUID(),
        conversation_id: a.conv.id,
        sender_id: a.att.id,
        type: 'text',
        body_original: 'x',
        body_display: 'x',
        client_message_id: randomUUID(),
      },
    });
    const before = await prisma.conversationParticipant.findUniqueOrThrow({
      where: {
        conversation_id_user_id: {
          conversation_id: a.conv.id,
          user_id: a.cli.id,
        },
      },
    });
    await prisma.$transaction((tx) =>
      recordSentMessage(
        tx,
        { conversationId: a.conv.id, messageId: m.id, createdAt: m.created_at },
        a.att.id,
      ),
    );
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
  });

  it('a sender who is not a participant aborts the send (nothing half-written)', async () => {
    const { conv } = await chat();
    const stranger = await prisma.user.create({ data: { role: 'client' } });
    const m = await prisma.message.create({
      data: {
        id: randomUUID(),
        conversation_id: conv.id,
        sender_id: stranger.id,
        type: 'text',
        body_original: 'x',
        body_display: 'x',
        client_message_id: randomUUID(),
      },
    });
    await expect(
      prisma.$transaction((tx) =>
        recordSentMessage(
          tx,
          { conversationId: conv.id, messageId: m.id, createdAt: m.created_at },
          stranger.id,
        ),
      ),
    ).rejects.toThrow('no participant row');
  });
});
