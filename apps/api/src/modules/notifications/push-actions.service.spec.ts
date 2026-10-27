import { PushActionsService } from './push-actions.service';
import { pushActionKey, signPushAction } from './push/push-action-token';

/** Owner 2026-10-26: «Ответить» / «Прочитано» on a chat notification work
 * only with a genuine ticket from a device still signed in to that account,
 * and go through the normal chat / group code. */
const PEPPER = 'p'.repeat(40);
const key = pushActionKey(PEPPER);

function setup(
  opts: {
    device?: { userId: string; sessionChainId: string } | null;
    status?: string;
  } = {},
) {
  const chat = {
    read: jest.fn().mockResolvedValue({ lastReadMessageId: 'm1' }),
    send: jest.fn().mockResolvedValue({}),
  };
  const groups = {
    read: jest.fn().mockResolvedValue({ lastReadMessageId: 'm1' }),
    send: jest.fn().mockResolvedValue({}),
  };
  const tokens = {
    deviceSession: jest
      .fn()
      .mockResolvedValue(
        opts.device === undefined
          ? { userId: 'me', sessionChainId: 'chain1' }
          : opts.device,
      ),
  };
  const prisma = {
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ role: 'client', status: opts.status ?? 'active' }),
    },
  };
  const s = new PushActionsService(
    { get: () => PEPPER } as never,
    prisma as never,
    tokens as never,
    chat as never,
    groups as never,
  );
  return { s, chat, groups, tokens };
}

const ticket = (g: 0 | 1 = 0, u = 'me') =>
  signPushAction(key, { u, c: g ? 'g1' : 'c1', g });
const fcmToken = 'device-token-123';

describe('PushActionsService', () => {
  it('«Прочитано» in a 1:1 chat reads up to the message as that user', async () => {
    const { s, chat } = setup();
    await s.act({ token: ticket(), fcmToken, action: 'read', messageId: 'm1' });
    expect(chat.read).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'me', sid: 'chain1', role: 'client' }),
      'c1',
      'm1',
    );
  });

  it('«Ответить» in a group sends a text through the group code', async () => {
    const { s, groups } = setup();
    await s.act({
      token: ticket(1),
      fcmToken,
      action: 'reply',
      text: '  ok, thanks ',
      clientMessageId: 'push-abcdefgh',
    });
    expect(groups.send).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'me' }),
      'g1',
      { clientMessageId: 'push-abcdefgh', type: 'text', body: 'ok, thanks' },
    );
  });

  it('a retry without an id is the same message (stable id)', async () => {
    const { s, chat } = setup();
    const dto = {
      token: ticket(),
      fcmToken,
      action: 'reply' as const,
      text: 'hi',
    };
    await s.act(dto);
    await s.act(dto);
    const ids = (
      chat.send.mock.calls as [unknown, string, { clientMessageId: string }][]
    ).map((c) => c[2].clientMessageId);
    expect(ids[0]).toBe(ids[1]);
  });

  it('refuses a forged ticket', async () => {
    const { s, chat } = setup();
    const bad = signPushAction(pushActionKey('q'.repeat(40)), {
      u: 'me',
      c: 'c1',
      g: 0,
    });
    await expect(
      s.act({ token: bad, fcmToken, action: 'read', messageId: 'm1' }),
    ).rejects.toMatchObject({ status: 401 });
    expect(chat.read).not.toHaveBeenCalled();
  });

  it('refuses a signed-out device and a device of another account', async () => {
    const out = setup({ device: null });
    await expect(
      out.s.act({ token: ticket(), fcmToken, action: 'read', messageId: 'm1' }),
    ).rejects.toMatchObject({ status: 401 });
    const other = setup({ device: { userId: 'someone', sessionChainId: 'x' } });
    await expect(
      other.s.act({
        token: ticket(),
        fcmToken,
        action: 'read',
        messageId: 'm1',
      }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('refuses a blocked account and an empty reply', async () => {
    const blocked = setup({ status: 'suspended' });
    await expect(
      blocked.s.act({ token: ticket(), fcmToken, action: 'reply', text: 'x' }),
    ).rejects.toMatchObject({ status: 401 });
    const empty = setup();
    await expect(
      empty.s.act({ token: ticket(), fcmToken, action: 'reply', text: '   ' }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
