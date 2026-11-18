import { CallsHotlineBridge } from './hotline-call-bridge';

/**
 * Audit 17.11 #6 (owner rule: an attorney never calls a client): after a
 * hotline call the direct chat opens for messages, but it is NOT accepted on
 * the attorney's behalf — accepting unlocks contacts and 1:1 calls both ways.
 */
describe('hotline call bridge — the chat after the call (audit #6)', () => {
  const setup = (conv: { id: string; contactsUnlocked: boolean }) => {
    const log: string[] = [];
    const prisma = {
      hotlineCall: {
        updateMany: () => Promise.resolve({ count: 1 }),
      },
      conversation: {
        updateMany: (q: unknown) => {
          log.push(`conversation.updateMany ${JSON.stringify(q)}`);
          return Promise.resolve({ count: 1 });
        },
      },
    };
    const chat = {
      startDirect: (user: { sub: string; role: string }, other: string) => {
        log.push(`startDirect ${user.role}:${user.sub} -> ${other}`);
        return Promise.resolve(conv);
      },
      answerRequest: () => {
        log.push('answerRequest');
        return Promise.resolve(conv);
      },
    };
    const bridge = new CallsHotlineBridge(
      prisma as never,
      { get: () => chat } as never,
      { setContext: () => undefined, info: () => undefined } as never,
    );
    return { bridge, log };
  };
  const finish = {
    requestId: 'r1',
    clientId: 'client-1',
    attorneyId: 'lawyer-1',
    endedAt: 1_800_000_000_000,
    reason: 'ended',
    durationSec: 90,
  };

  it('a new chat: started by the CLIENT, opened for messages, contacts and calls stay locked; never accepted for the attorney', async () => {
    const { bridge, log } = setup({ id: 'conv-1', contactsUnlocked: false });
    expect(await bridge.finish(finish)).toEqual({ conversationId: 'conv-1' });
    expect(log).not.toContain('answerRequest');
    expect(log[0]).toBe('startDirect client:client-1 -> lawyer-1');
    const update = log.find((l) => l.startsWith('conversation.updateMany'));
    expect(update).toBeDefined();
    const q = JSON.parse(update!.replace('conversation.updateMany ', '')) as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    expect(q.where).toMatchObject({
      id: 'conv-1',
      request_status: 'pending',
      requested_by: 'client-1',
      contacts_unlocked: false,
    });
    expect(q.data).toEqual({ request_status: 'accepted' });
    expect(q.data).not.toHaveProperty('contacts_unlocked');
  });

  it('a chat the pair already had unlocked (a case, an earlier accepted chat) is left as it was', async () => {
    const { bridge, log } = setup({ id: 'conv-2', contactsUnlocked: true });
    await bridge.finish(finish);
    expect(log).toEqual(['startDirect client:client-1 -> lawyer-1']);
  });
});
