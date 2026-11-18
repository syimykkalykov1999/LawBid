import { MediaModerationQueue } from './media-moderation.queue';
import {
  MEDIA_REHIDE_JOB,
  REHIDE_DELAY_MS,
} from './media-moderation.constants';

/**
 * Verify batch 13 (Q1): BullMQ drops an add whose job id it still holds
 * (the running job, or a kept completed one). The rehide job asks for the
 * next try from inside itself, so the next try needs another id; two asks
 * in the same 10-minute slot (the hourly sweep and the chain) stay one job.
 */
describe('MediaModerationQueue.enqueueRehide job ids', () => {
  const add = jest.fn<
    Promise<void>,
    [string, unknown, { jobId: string; delay?: number }]
  >(() => Promise.resolve());
  const q = new MediaModerationQueue(
    { get: () => undefined } as never,
    { setContext: () => undefined, error: () => undefined } as never,
  );
  Object.assign(q, { queue: { add } });
  const idOf = (call: [string, unknown, { jobId: string }]) => call[2].jobId;

  afterEach(() => {
    add.mockClear();
    jest.useRealTimers();
  });

  it('the next try 10 minutes later gets a new id; the same slot keeps one', async () => {
    jest.useFakeTimers({ now: Date.UTC(2026, 10, 18, 9, 0, 1) });
    await q.enqueueRehide('c1');
    await q.enqueueRehide('c1');
    jest.setSystemTime(Date.UTC(2026, 10, 18, 9, 0, 1) + REHIDE_DELAY_MS);
    await q.enqueueRehide('c1');
    expect(add).toHaveBeenCalledTimes(3);
    const [a, b, c] = add.mock.calls.map(idOf);
    expect(add.mock.calls[0][0]).toBe(MEDIA_REHIDE_JOB);
    expect(a).toBe(b);
    expect(c).not.toBe(a);
    expect(add.mock.calls[0][2]).toMatchObject({ delay: REHIDE_DELAY_MS });
  });
});
