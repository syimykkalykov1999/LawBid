import { PUSH_PRIORITY } from './push.constants';
import { PushQueueService } from './push-queue.service';

jest.mock('bullmq', () => {
  const queue = {
    add: jest.fn(() => Promise.resolve({})),
    addBulk: jest.fn(() => Promise.resolve([])),
    rateLimit: jest.fn(() => Promise.resolve()),
    close: jest.fn(() => Promise.resolve()),
  };
  return { Queue: jest.fn(() => queue), __queue: queue };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const queue = (require('bullmq') as { __queue: Record<string, jest.Mock> })
  .__queue;

function service(): PushQueueService {
  const s = new PushQueueService(
    { get: () => 'redis://x' } as never,
    { setContext: jest.fn(), warn: jest.fn() } as never,
  );
  s.onApplicationBootstrap();
  return s;
}

function optsOf(call: unknown[]): { priority?: number } {
  return call[2] as { priority?: number };
}

describe('push queue priorities (S10-5)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rings and on-call alerts are served before chat, chat before bulk', async () => {
    const s = service();
    await s.enqueueCall({ recipientId: 'u', callId: 'c' });
    await s.enqueueCallEnded({ recipientId: 'u', callId: 'c' });
    await s.enqueueOpsAlert({
      recipientId: 'u',
      title: 't',
      body: 'b',
      incidentId: 'i',
      event: 'e',
      seq: 1,
    });
    await s.enqueueMessage({
      recipientId: 'u',
      conversationId: 'cv',
      messageId: 'm',
    });
    await s.enqueue('n1', 'new_bid' as never);
    const p = queue.add.mock.calls.map((c) => optsOf(c as unknown[]).priority);
    expect(p).toEqual([
      PUSH_PRIORITY.urgent,
      PUSH_PRIORITY.urgent,
      PUSH_PRIORITY.urgent,
      PUSH_PRIORITY.message,
      PUSH_PRIORITY.notification,
    ]);
    expect(PUSH_PRIORITY.urgent).toBeLessThan(PUSH_PRIORITY.message);
    expect(PUSH_PRIORITY.message).toBeLessThan(PUSH_PRIORITY.notification);
    expect(PUSH_PRIORITY.notification).toBeLessThan(PUSH_PRIORITY.bulk);
  });

  it('a channel post fan-out and group batches queue behind individual pushes', async () => {
    const s = service();
    await s.enqueueMany(['a', 'b'], 'new_bid' as never);
    await s.enqueueGroupMessages({
      groupId: 'g',
      messageId: 'm',
      recipientIds: ['a'],
    });
    const bulk = queue.addBulk.mock.calls[0][0] as Array<{
      opts: { priority: number };
    }>;
    const group = queue.addBulk.mock.calls[1][0] as Array<{
      opts: { priority: number };
    }>;
    expect(bulk[0].opts.priority).toBe(PUSH_PRIORITY.bulk);
    expect(group[0].opts.priority).toBe(PUSH_PRIORITY.group);
  });

  it('pauseFor sets the queue-wide BullMQ rate limit', async () => {
    const s = service();
    await s.pauseFor(45_000);
    expect(queue.rateLimit).toHaveBeenCalledWith(45_000);
  });
});
