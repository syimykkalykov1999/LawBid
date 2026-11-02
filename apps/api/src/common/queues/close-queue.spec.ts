import { closeQueueBounded } from './close-queue';

describe('closeQueueBounded (shutdown while Redis is away must not hang)', () => {
  it('awaits a close that finishes, tolerates one that fails, gives up on one that hangs', async () => {
    const ok = { name: 'q', close: jest.fn(() => Promise.resolve()) };
    await closeQueueBounded(ok);
    expect(ok.close).toHaveBeenCalledTimes(1);
    const failing = {
      name: 'q',
      close: jest.fn(() => Promise.reject(new Error('closed'))),
    };
    await expect(closeQueueBounded(failing)).resolves.toBeUndefined();
    const hung = {
      name: 'q',
      close: jest.fn(() => new Promise<void>(() => undefined)),
    };
    const t0 = Date.now();
    await closeQueueBounded(hung, 20);
    expect(Date.now() - t0).toBeLessThan(1500);
    await expect(closeQueueBounded(undefined)).resolves.toBeUndefined();
  });
});
