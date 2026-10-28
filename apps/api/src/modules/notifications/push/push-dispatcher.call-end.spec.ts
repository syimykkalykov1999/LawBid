import { PushDispatcher } from './push-dispatcher';
import type { PushMessage } from './push.constants';

describe('PushDispatcher call_end', () => {
  it('sends a silent stop-ringing push, never held by settings', async () => {
    const sent: { message: PushMessage; key: string }[] = [];
    const sender = {
      send: (message: PushMessage, key: string) => {
        sent.push({ message, key });
        return Promise.resolve();
      },
    };
    const logger = { setContext: () => undefined };
    const d = new PushDispatcher(
      { mode: 'worker' },
      {} as never,
      {} as never,
      {} as never,
      sender,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      logger as never,
    );
    const r = await d.dispatch(
      { kind: 'call_end', recipientId: 'u1', callId: 'c1' },
      'j',
    );
    expect(r).toBe('sent');
    expect(sent).toEqual([
      {
        key: 'ce:c1',
        message: expect.objectContaining({
          userId: 'u1',
          callEnd: true,
          data: { type: 'call_ended', callId: 'c1' },
        }) as unknown,
      },
    ]);
  });

  /** LC-1: iPhones rung by VoIP stop through the VoIP channel too. */
  const withVoip = () => {
    const sent: PushMessage[] = [];
    const voip = { endCall: jest.fn().mockResolvedValue(1) };
    const d = new PushDispatcher(
      { mode: 'worker' },
      {} as never,
      {} as never,
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
      voip as never,
    );
    return { d, voip, sent };
  };

  it('a ring stop also goes as a VoIP push, sparing the answering phone', async () => {
    const { d, voip, sent } = withVoip();
    await d.dispatch(
      {
        kind: 'call_end',
        recipientId: 'u1',
        callId: 'c1',
        exceptChainId: 'chain-answered',
      },
      'j',
    );
    expect(voip.endCall).toHaveBeenCalledWith('u1', 'c1', 'chain-answered');
    expect(sent).toHaveLength(1);
  });

  it('the end of an answered call does not use the VoIP channel', async () => {
    const { d, voip, sent } = withVoip();
    await d.dispatch(
      { kind: 'call_end', recipientId: 'u1', callId: 'c1', ended: true },
      'j',
    );
    expect(voip.endCall).not.toHaveBeenCalled();
    expect(sent).toHaveLength(1);
  });
});
