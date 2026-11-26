import { QueueConcurrencyService } from './queue-concurrency.service';
import { workerTuning } from './queue-hardening';
import {
  QUEUE_CONCURRENCY,
  applyQueueConcurrency,
  queueConcurrency,
  resetTrackedForTest,
  resolveConcurrency,
  trackConcurrency,
  trackedWorkers,
} from './queue-concurrency';

/** THIRD_PASS_A Q5 (26.11): queue worker concurrency from admin settings,
 * live, no ceiling (owner 26.11). */
describe('queue worker concurrency (Q5)', () => {
  afterEach(() => resetTrackedForTest());

  function fakeWorker(name: string, concurrency = 0) {
    const handlers: Array<() => void> = [];
    return {
      name,
      concurrency: concurrency || QUEUE_CONCURRENCY[name]?.default || 1,
      on: (_e: 'closed', fn: () => void) => handlers.push(fn),
      close: () => handlers.forEach((fn) => fn()),
    };
  }

  it('defaults are the built-in numbers the runners had', () => {
    expect(queueConcurrency('push')).toBe(20);
    expect(queueConcurrency('case-fanout')).toBe(4);
    expect(queueConcurrency('data-export')).toBe(2);
    expect(queueConcurrency('admin-broadcast')).toBe(1);
    expect(Object.keys(QUEUE_CONCURRENCY)).toHaveLength(14);
    expect(() => queueConcurrency('nope')).toThrow();
  });

  it('a whole number >= 1 is used, with no ceiling; anything else keeps the default', () => {
    expect(resolveConcurrency(1, 4)).toBe(1);
    expect(resolveConcurrency(5000, 4)).toBe(5000);
    expect(resolveConcurrency(1_000_000, 4)).toBe(1_000_000);
    for (const bad of [0, -3, 1.5, Number.NaN, '7', null, undefined]) {
      expect(resolveConcurrency(bad, 4)).toBe(4);
    }
  });

  it('applies the setting to the running workers, reads each queue once, reports changes', async () => {
    const push1 = fakeWorker('push');
    const push2 = fakeWorker('push');
    const files = fakeWorker('files');
    trackConcurrency(push1);
    trackConcurrency(push2);
    trackConcurrency(files);
    // Not listed (message order per partition): left alone.
    trackConcurrency(fakeWorker('group-fanout-0'));
    expect(trackedWorkers().size).toBe(3);
    const values: Record<string, unknown> = {
      'ops.queue_concurrency_push': 64,
      'ops.queue_concurrency_files': 2,
    };
    const read = jest.fn((k: string) => Promise.resolve(values[k]));
    const changes = await applyQueueConcurrency(read as never);
    expect(read).toHaveBeenCalledTimes(2);
    expect(push1.concurrency).toBe(64);
    expect(push2.concurrency).toBe(64);
    expect(files.concurrency).toBe(2);
    expect(changes).toEqual([
      { queue: 'push', from: 20, to: 64 },
      { queue: 'push', from: 20, to: 64 },
    ]);
    // Back to the default when the value is broken.
    values['ops.queue_concurrency_push'] = 0;
    await applyQueueConcurrency(read as never);
    expect(push1.concurrency).toBe(20);
  });

  it('a read error leaves the worker as it is; a closed worker is dropped', async () => {
    const w = fakeWorker('post-fanout');
    trackConcurrency(w);
    await applyQueueConcurrency(() => Promise.reject(new Error('redis down')));
    expect(w.concurrency).toBe(4);
    w.close();
    expect(trackedWorkers().size).toBe(0);
  });

  it('the service applies the admin setting on its tick and never throws', async () => {
    const w = fakeWorker('stripe-webhooks');
    trackConcurrency(w);
    const settings = { number: jest.fn(() => Promise.resolve(9)) };
    const svc = new QueueConcurrencyService(settings as never);
    await svc.tick();
    expect(settings.number).toHaveBeenCalledWith(
      'ops.queue_concurrency_stripe_webhooks',
    );
    expect(w.concurrency).toBe(9);
    settings.number.mockRejectedValue(new Error('down'));
    await expect(svc.tick()).resolves.toBeUndefined();
    expect(w.concurrency).toBe(9);
  });

  it('Q3: the group fan-out partitions get the same tuning as the other fan-outs', () => {
    expect(workerTuning('group-fanout')).toEqual(workerTuning('post-fanout'));
    expect(workerTuning('group-fanout').lockDuration).toBe(90_000);
  });

  it('every listed queue has its admin setting with the same default', async () => {
    const { APP_SETTINGS } =
      await import('../app-settings/app-settings.defaults');
    for (const [queue, { key, default: d }] of Object.entries(
      QUEUE_CONCURRENCY,
    )) {
      expect([queue, APP_SETTINGS[key]]).toEqual([queue, d]);
    }
  });
});
