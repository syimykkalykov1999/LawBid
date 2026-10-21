import { PushDispatcher } from './push-dispatcher';
import type { PushMessage } from './push.constants';

/** Owner 2026-10-21: a call started in a group chat is a light notification
 * (Telegram), never a ringing call; a plain group call still rings. */
function build(call: Record<string, unknown>) {
  const sent: PushMessage[] = [];
  const ring = jest.fn().mockResolvedValue([]);
  const prisma = {
    call: { findUnique: jest.fn().mockResolvedValue(call) },
    chatGroup: {
      findUnique: jest.fn().mockResolvedValue({ title: 'Team' }),
    },
  };
  const d = new PushDispatcher(
    { mode: 'worker' },
    {} as never,
    prisma as never,
    {} as never,
    {
      send: (m: PushMessage) => {
        sent.push(m);
        return Promise.resolve();
      },
    },
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { setContext: () => undefined } as never,
    undefined,
    undefined,
    undefined,
    { ringCall: ring } as never,
    { fcmTokensCoveredBy: jest.fn() } as never,
  );
  // Settings never hold a call back in this test.
  (d as unknown as { pushAllowed: () => Promise<boolean> }).pushAllowed = () =>
    Promise.resolve(true);
  return { d, sent, ring };
}

const base = {
  status: 'active',
  conversation_id: null,
  video: false,
  is_group: true,
  caller_id: 'a',
  callee: { status: 'active', ui_language: 'en' },
  caller: { first_name: 'Ann', last_name: 'Lee' },
};

describe('PushDispatcher call from a group chat', () => {
  it('says «started a call · Join» without ringing', async () => {
    const { d, sent, ring } = build({
      ...base,
      group_id: 'g1',
      participants: [
        {
          invited_by_id: 'a',
          invited_by: { first_name: 'Ann', last_name: 'Lee' },
          user: { status: 'active', ui_language: 'en' },
        },
      ],
    });
    const r = await d.dispatch(
      { kind: 'call', recipientId: 'u1', callId: 'c1' } as never,
      'j',
    );
    expect(r).toBe('sent');
    expect(ring).not.toHaveBeenCalled();
    expect(sent).toHaveLength(1);
    expect(sent[0].call).toBeUndefined();
    expect(sent[0].title).toBe('Team');
    expect(sent[0].body).toBe('Ann Lee started a call · Join');
    expect(sent[0].data).toMatchObject({
      type: 'group_call',
      callId: 'c1',
      groupId: 'g1',
    });
  });

  it('an invite by another member says «invites you»', async () => {
    const { d, sent } = build({
      ...base,
      group_id: 'g1',
      participants: [
        {
          invited_by_id: 'b',
          invited_by: { first_name: 'Bob', last_name: null },
          user: { status: 'active', ui_language: 'en' },
        },
      ],
    });
    await d.dispatch(
      { kind: 'call', recipientId: 'u1', callId: 'c1' } as never,
      'j',
    );
    expect(sent[0].body).toBe('Bob invites you to a call · Join');
  });

  it('a plain group call (no group chat) still rings', async () => {
    const { d, sent, ring } = build({
      ...base,
      group_id: null,
      participants: [
        {
          invited_by_id: 'a',
          invited_by: { first_name: 'Ann', last_name: 'Lee' },
          user: { status: 'active', ui_language: 'en' },
        },
      ],
    });
    await d.dispatch(
      { kind: 'call', recipientId: 'u1', callId: 'c1' } as never,
      'j',
    );
    expect(ring).toHaveBeenCalled();
    expect(sent[0].call).toBe(true);
    expect(sent[0].data).toMatchObject({ type: 'incoming_call' });
  });
});
