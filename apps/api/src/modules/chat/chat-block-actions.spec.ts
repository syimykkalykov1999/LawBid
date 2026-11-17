/* eslint-disable @typescript-eslint/require-await -- in-memory fakes */
import { ChatActionsService } from './chat-actions.service';
import { ChatService } from './chat.service';

/**
 * R2B-5 (detective R2, 14.11): while one side of a 1:1 chat blocks the
 * other, `send()` refuses (OQ-028), but edit / react / pin and the
 * disappearing timer still went through — each one a realtime update and a
 * push to the person who blocked. The same block check now runs for them
 * (a case chat with work in progress is still exempt, as for send).
 */
const conv = {
  id: 'cv1',
  client_id: 'x',
  attorney_id: 'y',
  case_id: null,
  contacts_unlocked: false,
  status: 'open',
  request_status: 'accepted',
  disappear_after_s: null,
};
const message = {
  id: 'm1',
  conversation_id: 'cv1',
  sender_id: 'x',
  type: 'text',
  revoked_at: null,
  created_at: new Date(),
  body_original: 'hi',
};

function world(blocked: boolean) {
  const blocks = {
    isBlockedEitherWay: jest.fn(async () => blocked),
    assertNotBlocked: jest.fn(async () => {
      if (blocked) {
        throw Object.assign(new Error('USER_BLOCKED'), { status: 403 });
      }
    }),
  };
  const writes = jest.fn(async () => undefined);
  const prisma: Record<string, unknown> = {
    message: {
      findFirst: jest.fn(async () => ({ ...message })),
      findUnique: jest.fn(async () => ({ ...message })),
      findUniqueOrThrow: jest.fn(async () => ({ ...message })),
      update: writes,
      updateMany: writes,
    },
    conversation: { updateMany: writes },
    messageEdit: { create: writes },
    messageSearchToken: { deleteMany: writes, createMany: writes },
    messageReaction: { deleteMany: writes, upsert: writes },
    messagePin: {
      deleteMany: writes,
      findMany: jest.fn(async () => []),
      create: writes,
    },
    $transaction: jest.fn(async (arg: unknown): Promise<unknown> =>
      typeof arg === 'function'
        ? (arg as (tx: unknown) => Promise<unknown>)(prisma)
        : arg,
    ),
  };
  const chat = Object.create(ChatService.prototype) as ChatService;
  Object.assign(chat, {
    prisma,
    blocks,
    load: jest.fn(async () => ({ ...conv })),
    mediaLinks: jest.fn(async () => new Map()),
    toMessage: jest.fn(() => ({ id: 'm1' })),
    present: jest.fn(async () => [{ id: 'cv1' }]),
  });
  const actions = Object.create(
    ChatActionsService.prototype,
  ) as ChatActionsService;
  Object.assign(actions, {
    prisma,
    chat,
    settings: { number: jest.fn(async () => 15) },
    realtime: { toUsers: jest.fn() },
    stars: { chargeReaction: jest.fn(async () => undefined) },
    notifications: { emit: jest.fn(async () => undefined) },
  });
  return { actions, chat, writes, actionsRealtime: actions };
}
const x = { sub: 'x', role: 'client' } as never;

describe('blocked 1:1 chat: no edit / react / pin / timer (R2B-5)', () => {
  it('edit is refused and nothing is written', async () => {
    const w = world(true);
    await expect(w.actions.edit(x, 'cv1', 'm1', 'new')).rejects.toMatchObject({
      status: 403,
    });
    expect(w.writes).not.toHaveBeenCalled();
  });

  it('react is refused', async () => {
    const w = world(true);
    await expect(w.actions.react(x, 'cv1', 'm1', '👍')).rejects.toMatchObject({
      status: 403,
    });
    expect(w.writes).not.toHaveBeenCalled();
  });

  it('pin is refused', async () => {
    const w = world(true);
    await expect(w.actions.pin(x, 'cv1', 'm1', true)).rejects.toMatchObject({
      status: 403,
    });
    expect(w.writes).not.toHaveBeenCalled();
  });

  it('the disappearing timer cannot be switched', async () => {
    const w = world(true);
    await expect(
      w.chat.setDisappearing(x, 'cv1', 86_400),
    ).rejects.toMatchObject({ status: 403 });
    expect(w.writes).not.toHaveBeenCalled();
  });

  it('without a block, edit works and its push names the actor', async () => {
    const w = world(false);
    await w.actions.edit(x, 'cv1', 'm1', 'new');
    const emit = (
      w.actions as unknown as { notifications: { emit: jest.Mock } }
    ).notifications.emit;
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'y',
        payload: expect.objectContaining({ event: 'edit', actorId: 'x' }),
      }),
    );
  });
});
