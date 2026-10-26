import { PushDispatcher } from './push-dispatcher';
import type { PushMessage } from './push.constants';

/**
 * Owner 2026-10-21: «Calls» off in Settings, and «mute calls» of one chat or
 * group, both make the incoming call ring silently (it is never lost).
 */
describe('PushDispatcher incoming call silence', () => {
  function build(opts: {
    callsOn?: boolean;
    chatMuted?: boolean;
    groupMuted?: boolean;
    group?: boolean;
  }) {
    const sent: PushMessage[] = [];
    const prisma = {
      call: {
        findUnique: () =>
          Promise.resolve({
            status: 'ringing',
            conversation_id: opts.group ? null : 'conv1',
            group_id: opts.group ? 'g1' : null,
            video: false,
            is_group: !!opts.group,
            callee: { status: 'active', ui_language: 'en' },
            caller: { first_name: 'Ann', last_name: 'B' },
            participants: [],
          }),
      },
      notificationSetting: {
        findUnique: () =>
          Promise.resolve(
            opts.callsOn === false ? { push_enabled: false } : null,
          ),
      },
      conversationParticipant: {
        findUnique: () => Promise.resolve({ calls_muted: !!opts.chatMuted }),
      },
      chatGroupMember: {
        findUnique: () => Promise.resolve({ calls_muted: !!opts.groupMuted }),
      },
    };
    const sender = {
      send: (m: PushMessage) => {
        sent.push(m);
        return Promise.resolve();
      },
    };
    const d = new PushDispatcher(
      { mode: 'worker' },
      {} as never,
      prisma as never,
      {} as never,
      sender,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { setContext: () => undefined } as never,
    );
    return { d, sent };
  }
  const job = { kind: 'call' as const, recipientId: 'u1', callId: 'c1' };

  it('rings normally when nothing is muted', async () => {
    const { d, sent } = build({});
    await d.dispatch(job, 'j');
    expect(sent[0].data?.silent).toBeUndefined();
  });

  it('is silent when «Calls» is off globally', async () => {
    const { d, sent } = build({ callsOn: false });
    await d.dispatch(job, 'j');
    expect(sent[0].data?.silent).toBe('1');
  });

  it('is silent when the calls of that chat are muted', async () => {
    const { d, sent } = build({ chatMuted: true });
    await d.dispatch(job, 'j');
    expect(sent[0].data?.silent).toBe('1');
  });

  it('sends no notice at all when the calls of that group are muted', async () => {
    const { d, sent } = build({ group: true, groupMuted: true });
    await d.dispatch(job, 'j');
    expect(sent).toHaveLength(0);
  });

  it('sends no group «Join» notice while «Calls» is off (inbox 30)', async () => {
    const { d, sent } = build({ group: true, callsOn: false });
    expect(await d.dispatch(job, 'j')).toBe('disabled');
    expect(sent).toHaveLength(0);
  });
});
