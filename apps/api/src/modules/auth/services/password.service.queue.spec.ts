import { HttpException } from '@nestjs/common';
import { PasswordService } from './password.service';

/**
 * Security audit 2026-11-08 (L1): sign-ins to made-up accounts each burn a
 * dummy hash in the shared scrypt queue. A flood of them must not push the
 * queue full for real people: they wait in a lower line holding at most
 * half of the queue, and a freed slot serves the real accounts first.
 */
type Lane = 'high' | 'low';
type Slot = <T>(work: () => Promise<T>, lane?: Lane) => Promise<T>;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

const flush = () => new Promise((r) => setImmediate(r));

function service() {
  const values: Record<string, number> = {
    'security.password_hash_concurrency': 1,
    'security.password_hash_max_queue': 4,
  };
  const settings = { number: (k: string) => Promise.resolve(values[k]) };
  const s = new PasswordService(settings as never);
  const slot = (
    s as unknown as { withSlot: Slot }
  ).withSlot.bind(s) as Slot;
  return slot;
}

describe('PasswordService hash queue lanes (audit 2026-11-08 L1)', () => {
  it('unknown-account checks fill at most half the queue', async () => {
    const slot = service();
    const gate = deferred();
    const busy = slot(() => gate.promise, 'high');
    await flush();
    const lows = [slot(async () => 'l1', 'low'), slot(async () => 'l2', 'low')];
    await flush();
    await expect(slot(async () => 'l3', 'low')).rejects.toBeInstanceOf(
      HttpException,
    );
    // The real account still gets in line.
    const high = slot(async () => 'h1', 'high');
    gate.resolve();
    await busy;
    await expect(Promise.all([high, ...lows])).resolves.toEqual([
      'h1',
      'l1',
      'l2',
    ]);
  });

  it('a freed slot serves a real account before earlier unknown ones', async () => {
    const slot = service();
    const gate = deferred();
    const order: string[] = [];
    const busy = slot(() => gate.promise, 'high');
    await flush();
    const low = slot(async () => void order.push('low'), 'low');
    await flush();
    const high = slot(async () => void order.push('high'), 'high');
    await flush();
    gate.resolve();
    await Promise.all([busy, low, high]);
    expect(order).toEqual(['high', 'low']);
  });

  it('a wrong password for an unknown account still costs a full hash', async () => {
    const s = new PasswordService();
    const real = await s.hash('Correct horse 1');
    expect(await s.verify('Correct horse 1', null)).toBe(false);
    expect(await s.verify('Correct horse 1', real)).toBe(true);
  });
});
