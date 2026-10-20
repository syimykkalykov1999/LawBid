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
});
