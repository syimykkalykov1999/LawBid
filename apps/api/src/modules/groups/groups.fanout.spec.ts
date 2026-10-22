import type { ConfigService } from '@nestjs/config';
import type { ChatGroupMessage } from '@prisma/client';
import type { PinoLogger } from 'nestjs-pino';
import { GroupFanoutQueue } from './group-fanout.queue';
import { GroupsService } from './groups.service';

/** Owner 2026-10-22 (server load audit, finding 7): a group message reaches
 * 512 members with a handful of publishes, one batched badge call and one
 * push enqueue — not one emit, badge and push per member. */
const members = Array.from({ length: 512 }, (_, i) => `u${i}`);

function row(over: Partial<ChatGroupMessage> = {}): ChatGroupMessage {
  return {
    id: 'm1',
    group_id: 'g1',
    sender_id: 'u0',
    type: 'text',
    mention_ids: ['u7'],
    deleted_at: null,
    ...over,
  } as ChatGroupMessage;
}

function setup(message = row()) {
  const prisma = {
    chatGroupMember: {
      findMany: jest.fn(() =>
        Promise.resolve(members.map((user_id) => ({ user_id }))),
      ),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    chatGroupMessage: { findFirst: jest.fn(() => Promise.resolve(message)) },
    chatGroup: {
      findUnique: () => Promise.resolve({ show_service_messages: true }),
    },
  };
  const toUsers = jest.fn();
  const messagesArrived = jest.fn().mockResolvedValue(undefined);
  const queueGroupMessagePushes = jest.fn().mockResolvedValue(undefined);
  const presenter = {
    messages: (rows: ChatGroupMessage[]) =>
      Promise.resolve(
        rows.map((r) => ({ id: r.id, deleted: r.deleted_at !== null })),
      ),
  };
  // No REDIS_URL: the queue delivers inline (as in unit tests).
  const queue = new GroupFanoutQueue(
    { get: () => undefined } as unknown as ConfigService,
    { setContext: jest.fn(), warn: jest.fn() } as unknown as PinoLogger,
  );
  const svc = new GroupsService(
    prisma as never,
    {} as never,
    { toUsers } as never,
    { queueGroupMessagePushes } as never,
    { messagesArrived } as never,
    {} as never,
    presenter as never,
    {} as never,
    {} as never,
    {} as never,
    queue,
  );
  return { svc, prisma, toUsers, messagesArrived, queueGroupMessagePushes };
}

describe('GroupsService fan-out', () => {
  it('a new message: ≤ 4 publishes, one badge batch, one push enqueue', async () => {
    const { svc, toUsers, messagesArrived, queueGroupMessagePushes, prisma } =
      setup();
    await svc.fanOut('g1', row());
    expect(prisma.chatGroupMember.updateMany).toHaveBeenCalledTimes(1);
    expect(toUsers.mock.calls.length).toBeLessThanOrEqual(4);
    const delivered = toUsers.mock.calls.flatMap(([ids]: [string[]]) => ids);
    expect(delivered.sort()).toEqual([...members].sort());
    // Personal flags survive the grouping.
    const flagsOf = (uid: string) =>
      (
        toUsers.mock.calls.find(([ids]: [string[]]) => ids.includes(uid)) as [
          string[],
          string,
          { message: { mine: boolean; mentionsMe: boolean } },
        ]
      )[2].message;
    expect(flagsOf('u0')).toMatchObject({ mine: true, mentionsMe: false });
    expect(flagsOf('u7')).toMatchObject({ mine: false, mentionsMe: true });
    expect(flagsOf('u8')).toMatchObject({ mine: false, mentionsMe: false });
    expect(messagesArrived).toHaveBeenCalledTimes(1);
    expect(messagesArrived.mock.calls[0][0]).toHaveLength(511);
    expect(messagesArrived.mock.calls[0][1]).toBe('m1');
    expect(queueGroupMessagePushes).toHaveBeenCalledWith({
      groupId: 'g1',
      messageId: 'm1',
      recipientIds: members.slice(1),
    });
  });

  it('push: false (forwarded batch) — no pushes, badges still', async () => {
    const { svc, messagesArrived, queueGroupMessagePushes } = setup();
    await svc.fanOut('g1', row(), { push: false });
    expect(messagesArrived).toHaveBeenCalledTimes(1);
    expect(queueGroupMessagePushes).not.toHaveBeenCalled();
  });

  it('the worker reads the message as it is now; deleted = event only', async () => {
    const { svc, toUsers, messagesArrived } = setup(
      row({ deleted_at: new Date() }),
    );
    await svc.deliverFanOut({
      kind: 'message',
      groupId: 'g1',
      messageId: 'm1',
    });
    expect(toUsers).toHaveBeenCalled();
    expect(messagesArrived).not.toHaveBeenCalled();
  });

  it('a broadcast job (edit, reaction…) sends the event only', async () => {
    const { svc, toUsers, messagesArrived, queueGroupMessagePushes } = setup();
    await svc.deliverFanOut({
      kind: 'broadcast',
      groupId: 'g1',
      messageId: 'm1',
    });
    expect(toUsers).toHaveBeenCalled();
    expect(messagesArrived).not.toHaveBeenCalled();
    expect(queueGroupMessagePushes).not.toHaveBeenCalled();
  });

  it('a message gone from the database: nothing', async () => {
    const { svc, toUsers, prisma } = setup();
    prisma.chatGroupMessage.findFirst.mockResolvedValueOnce(
      null as unknown as ChatGroupMessage,
    );
    await svc.deliverFanOut({ kind: 'message', groupId: 'g1', messageId: 'x' });
    expect(toUsers).not.toHaveBeenCalled();
  });
});
