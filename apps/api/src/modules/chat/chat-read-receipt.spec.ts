/* eslint-disable @typescript-eslint/require-await -- hand-made Prisma and realtime fakes */
import { ChatService } from './chat.service';

/**
 * R-404 (d) (owner 2026-11-04, WhatsApp): the moment the other side's
 * screen shows my message and acknowledges it, `POST /conversations/:id/read`
 * must tell ME over the socket — `message:read` to the sender's user room —
 * so the tick flips to the double «read» tick live, and tell my own other
 * devices (`conversation:read`) to drop the unread pill. A read that does
 * not move forward (an older message, a repeat) emits nothing.
 */
describe('ChatService.read emits the read receipt to the sender', () => {
  const t0 = new Date('2026-11-04T10:00:00.000Z');
  const t1 = new Date('2026-11-04T10:01:00.000Z');
  const messages = new Map([
    ['m1', { id: 'm1', created_at: t0 }],
    ['m2', { id: 'm2', created_at: t1 }],
  ]);

  function make(opts: {
    lastRead: string | null;
    reader: 'client' | 'attorney';
  }) {
    const participant = {
      last_read_message_id: opts.lastRead,
      last_delivered_message_id: null as string | null,
    };
    const tx = {
      conversationParticipant: {
        findUniqueOrThrow: jest.fn(async () => participant),
        update: jest.fn(async () => ({})),
      },
      message: {
        findUnique: jest.fn(
          async (q: { where: { id_conversation_id: { id: string } } }) =>
            messages.get(q.where.id_conversation_id.id) ?? null,
        ),
      },
    };
    const prisma = {
      $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
      message: {
        findFirst: jest.fn(
          async (q: { where: { id: string } }) =>
            messages.get(q.where.id) ?? null,
        ),
      },
    };
    const realtime = { toUsers: jest.fn() };
    const badges = { chatsChanged: jest.fn(async () => undefined) };
    const svc = Object.create(ChatService.prototype) as ChatService;
    const priv = svc as unknown as Record<string, unknown>;
    priv.prisma = prisma;
    priv.realtime = realtime;
    priv.badges = badges;
    priv.load = jest.fn(async () => ({
      id: 'conv1',
      client_id: 'client',
      attorney_id: 'attorney',
    }));
    priv.deliveredPatch = jest.fn(async () => ({}));
    const user = { sub: opts.reader, role: opts.reader } as never;
    return { svc, realtime, badges, tx, user };
  }

  it("the client reads my (the attorney's) message: message:read goes to the attorney, conversation:read to the client", async () => {
    const { svc, realtime, badges, tx, user } = make({
      lastRead: 'm1',
      reader: 'client',
    });
    const r = await svc.read(user, 'conv1', 'm2');
    expect(r).toEqual({ lastReadMessageId: 'm2' });
    expect(tx.conversationParticipant.update).toHaveBeenCalledTimes(1);
    expect(realtime.toUsers).toHaveBeenCalledWith(
      ['attorney'],
      'message:read',
      expect.objectContaining({
        conversationId: 'conv1',
        lastReadMessageId: 'm2',
        readAt: expect.any(String),
      }),
    );
    expect(realtime.toUsers).toHaveBeenCalledWith(
      ['client'],
      'conversation:read',
      {
        conversationId: 'conv1',
        lastReadMessageId: 'm2',
      },
    );
    expect(badges.chatsChanged).toHaveBeenCalledWith('client');
  });

  it('the attorney reading tells the client', async () => {
    const { svc, realtime, user } = make({
      lastRead: null,
      reader: 'attorney',
    });
    await svc.read(user, 'conv1', 'm1');
    expect(realtime.toUsers).toHaveBeenCalledWith(
      ['client'],
      'message:read',
      expect.objectContaining({ lastReadMessageId: 'm1' }),
    );
  });

  it('a read that does not move forward (older message, repeat) emits nothing', async () => {
    const { svc, realtime, tx, user } = make({
      lastRead: 'm2',
      reader: 'client',
    });
    expect(await svc.read(user, 'conv1', 'm1')).toEqual({
      lastReadMessageId: 'm2',
    });
    expect(await svc.read(user, 'conv1', 'm2')).toEqual({
      lastReadMessageId: 'm2',
    });
    expect(tx.conversationParticipant.update).not.toHaveBeenCalled();
    expect(realtime.toUsers).not.toHaveBeenCalled();
  });

  it('an unknown message is 404, nothing emitted', async () => {
    const { svc, realtime, user } = make({ lastRead: null, reader: 'client' });
    await expect(svc.read(user, 'conv1', 'nope')).rejects.toMatchObject({
      status: 404,
    });
    expect(realtime.toUsers).not.toHaveBeenCalled();
  });
});
