import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { groupReactions } from './group-presenter.service';
import { GroupReactionsService } from './group-reactions.service';

/**
 * Groups WhatsApp parity: reactions on group messages work like the 1:1
 * chat's (ChatActionsService.react) — one emoji per person, a new one
 * replaces the old, null removes it, a premium emoji is charged in the
 * same transaction, and every change is broadcast to the group.
 */
const user = { sub: 'u1', role: 'client' } as never;
const row = {
  id: 'm1',
  group_id: 'g1',
  type: 'text',
  deleted_at: null,
  sender_id: 'u2',
};

function setup(found: unknown = row) {
  const tx = {
    chatGroupMessageReaction: { upsert: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    chatGroupMessage: { findFirst: jest.fn().mockResolvedValue(found) },
    chatGroupMessageReaction: {
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const groups = {
    assertEnabled: jest.fn().mockResolvedValue(undefined),
    requireMember: jest.fn().mockResolvedValue({}),
    broadcast: jest.fn().mockResolvedValue(undefined),
  };
  const presenter = {
    messages: jest.fn().mockResolvedValue([{ id: 'm1', reactions: [] }]),
  };
  const stars = { chargeReaction: jest.fn().mockResolvedValue(0) };
  const notifications = { emit: jest.fn().mockResolvedValue(null) };
  const svc = new GroupReactionsService(
    prisma as never,
    groups as never,
    presenter as never,
    stars as never,
    notifications as never,
  );
  return { svc, prisma, tx, groups, presenter, stars, notifications };
}

describe('GroupReactionsService.react', () => {
  it('sets one emoji per person (charged in the save transaction) and broadcasts', async () => {
    const { svc, tx, groups, stars, presenter } = setup();
    await svc.react(user, 'g1', 'm1', ' 👍 ');
    expect(groups.assertEnabled).toHaveBeenCalled();
    expect(groups.requireMember).toHaveBeenCalledWith('u1', 'g1');
    expect(stars.chargeReaction).toHaveBeenCalledWith(tx, 'u1', 'm1', '👍');
    expect(tx.chatGroupMessageReaction.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { message_id_user_id: { message_id: 'm1', user_id: 'u1' } },
        create: expect.objectContaining({
          message_id: 'm1',
          group_id: 'g1',
          user_id: 'u1',
          emoji: '👍',
        }),
      }),
    );
    expect(groups.broadcast).toHaveBeenCalledWith('g1', row);
    expect(presenter.messages).toHaveBeenCalledWith([row], 'u1');
  });

  it('null removes my reaction only', async () => {
    const { svc, prisma, stars, groups } = setup();
    await svc.react(user, 'g1', 'm1', null);
    expect(prisma.chatGroupMessageReaction.deleteMany).toHaveBeenCalledWith({
      where: { message_id: 'm1', group_id: 'g1', user_id: 'u1' },
    });
    expect(stars.chargeReaction).not.toHaveBeenCalled();
    expect(groups.broadcast).toHaveBeenCalled();
  });

  it('pushes «Реакция 👍» to the author only, like the 1:1 reaction push', async () => {
    const { svc, notifications } = setup();
    await svc.react(user, 'g1', 'm1', ' 👍 ');
    expect(notifications.emit).toHaveBeenCalledTimes(1);
    expect(notifications.emit).toHaveBeenCalledWith({
      type: 'new_message',
      recipientId: 'u2',
      payload: {
        groupId: 'g1',
        conversationId: 'g1',
        messageId: 'm1',
        event: 'reaction',
        actorId: 'u1',
        emoji: '👍',
      },
    });
  });

  it('no push for my own message, for taking a reaction away or a service line author', async () => {
    const own = setup({ ...row, sender_id: 'u1' });
    await own.svc.react(user, 'g1', 'm1', '👍');
    expect(own.notifications.emit).not.toHaveBeenCalled();
    const off = setup();
    await off.svc.react(user, 'g1', 'm1', null);
    expect(off.notifications.emit).not.toHaveBeenCalled();
    const nobody = setup({ ...row, sender_id: null });
    await nobody.svc.react(user, 'g1', 'm1', '👍');
    expect(nobody.notifications.emit).not.toHaveBeenCalled();
  });

  it('a failed push never fails the reaction', async () => {
    const { svc, notifications, groups } = setup();
    notifications.emit.mockRejectedValueOnce(new Error('queue down'));
    await expect(svc.react(user, 'g1', 'm1', '👍')).resolves.toBeDefined();
    expect(groups.broadcast).toHaveBeenCalled();
  });

  it('refuses text that is not one emoji', async () => {
    const { svc, groups } = setup();
    await expect(svc.react(user, 'g1', 'm1', 'ok')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(groups.broadcast).not.toHaveBeenCalled();
  });

  it('a missing, deleted or service message cannot be reacted to', async () => {
    await expect(
      setup(null).svc.react(user, 'g1', 'm1', '👍'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      setup({ ...row, deleted_at: new Date() }).svc.react(
        user,
        'g1',
        'm1',
        '👍',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    const sys = setup({ ...row, type: 'system' });
    await expect(sys.svc.react(user, 'g1', 'm1', '👍')).rejects.toMatchObject({
      response: { code: ErrorCode.GROUP_FORBIDDEN },
    });
  });
});

describe('groupReactions', () => {
  it('counts per emoji in first-chosen order and marks the viewer', () => {
    const out = groupReactions(
      [
        { message_id: 'm1', user_id: 'a', emoji: '❤️' },
        { message_id: 'm1', user_id: 'b', emoji: '👍' },
        { message_id: 'm1', user_id: 'me', emoji: '❤️' },
        { message_id: 'm2', user_id: 'c', emoji: '😂' },
      ],
      'me',
    );
    expect(out.get('m1')).toEqual([
      { emoji: '❤️', count: 2, mine: true },
      { emoji: '👍', count: 1, mine: false },
    ]);
    expect(out.get('m2')).toEqual([{ emoji: '😂', count: 1, mine: false }]);
  });
});
