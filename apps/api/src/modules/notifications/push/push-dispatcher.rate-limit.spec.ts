import { Worker, type Job } from 'bullmq';
import { PushDispatcher } from './push-dispatcher';
import { FcmRateLimitError, retryAfterMs } from './fcm-push.sender';
import type { PushJobData } from './push.constants';

function dispatcher(mode: string) {
  const queue = { pauseFor: jest.fn(() => Promise.resolve()) };
  const logger = { setContext: () => undefined, warn: jest.fn() };
  const sender = {
    send: jest.fn(() => Promise.reject(new FcmRateLimitError(42_000))),
  };
  const settings = {
    string: jest.fn(() => Promise.resolve(mode)),
    number: jest.fn(() => Promise.resolve(5000)),
  };
  const d = new PushDispatcher(
    { mode: 'worker' },
    {} as never,
    {} as never,
    {} as never,
    sender,
    {} as never,
    queue as never,
    {} as never,
    {} as never,
    logger as never,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    settings as never,
  );
  return { d, queue, settings };
}

const job = {
  id: 'j1',
  data: { kind: 'call_end', recipientId: 'u1', callId: 'c1' },
} as unknown as Job<PushJobData>;

describe('PushDispatcher.processJob FCM 429 (S10-5)', () => {
  it('auto: pauses the whole push queue for what FCM asked and requeues the job without an attempt', async () => {
    const { d, queue } = dispatcher('auto');
    await d.applyRatePolicy();
    await expect(d.processJob(job)).rejects.toMatchObject({
      name: Worker.RateLimitError().name,
    });
    expect(queue.pauseFor).toHaveBeenCalledWith(42_000);
  });

  it('off: no queue-wide pause, the error goes to normal retry', async () => {
    const { d, queue } = dispatcher('off');
    await d.applyRatePolicy();
    await expect(d.processJob(job)).rejects.toBeInstanceOf(FcmRateLimitError);
    expect(queue.pauseFor).not.toHaveBeenCalled();
  });
});

describe('retryAfterMs', () => {
  it('reads seconds, dates, and bounds the result', () => {
    expect(retryAfterMs('30')).toBe(30_000);
    expect(retryAfterMs(null)).toBe(60_000);
    expect(retryAfterMs('0')).toBe(1_000);
    expect(retryAfterMs('99999')).toBe(300_000);
    expect(
      retryAfterMs(new Date(Date.now() + 20_000).toUTCString()),
    ).toBeLessThanOrEqual(20_000);
  });
});
