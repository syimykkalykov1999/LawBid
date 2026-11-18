import { FirmEmailService } from './firm-email.service';
import { AttorneyTrustService } from './attorney-trust.service';

/** A tiny in-memory Redis: every command yields to the event loop first,
 * like a network round trip, so parallel calls interleave as they do live. */
function memoryRedis() {
  const kv = new Map<string, string>();
  const tick = () => new Promise((r) => setImmediate(r));
  return {
    kv,
    async get(k: string) {
      await tick();
      return kv.get(k) ?? null;
    },
    async set(k: string, v: string) {
      await tick();
      kv.set(k, v);
      return 'OK';
    },
    async del(...ks: string[]) {
      await tick();
      ks.forEach((k) => kv.delete(k));
      return ks.length;
    },
    async ttl() {
      await tick();
      return 600;
    },
    async eval(_lua: string, _n: number, k: string) {
      await tick();
      const n = Number(kv.get(k) ?? 0) + 1;
      kv.set(k, String(n));
      return n;
    },
  };
}

/**
 * Verify 17.11 (batch 9): the firm e-mail code allowed 5 wrong guesses, but
 * the count was read, bumped and written back — guesses sent in parallel
 * all read 0, so the limit never tripped and the 6-digit code could be
 * guessed by a burst.
 */
describe('FirmEmailService.confirm — the attempt limit holds for parallel guesses', () => {
  it('after 5 guesses (sent at once) even the right code is refused', async () => {
    const redis = memoryRedis();
    const trust = { onFirmEmailConfirmed: jest.fn() };
    const svc = Object.create(FirmEmailService.prototype) as FirmEmailService;
    Object.assign(svc, {
      redis,
      trust: trust as unknown as AttorneyTrustService,
    });
    redis.kv.set(
      'trust:firm-email:att-1',
      JSON.stringify({
        code: '123456',
        domain: 'firm.com',
        email: 'a@firm.com',
        attempts: 0,
      }),
    );
    const wrong = Array.from({ length: 20 }, (_, i) =>
      svc
        .confirm('att-1', String(100000 + i))
        .catch(
          (e: { response?: { details?: { reason?: string } } }) =>
            e.response?.details?.reason,
        ),
    );
    const reasons = await Promise.all(wrong);
    const right = await svc
      .confirm('att-1', '123456')
      .then(() => 'confirmed')
      .catch(
        (e: { response?: { details?: { reason?: string } } }) =>
          e.response?.details?.reason,
      );
    expect(reasons.filter((r) => r === 'mismatch')).toHaveLength(5);
    expect(right).toBe('expired');
    expect(trust.onFirmEmailConfirmed).not.toHaveBeenCalled();
  });

  it('the right code within the limit confirms once', async () => {
    const redis = memoryRedis();
    const trust = { onFirmEmailConfirmed: jest.fn() };
    const svc = Object.create(FirmEmailService.prototype) as FirmEmailService;
    Object.assign(svc, {
      redis,
      trust: trust as unknown as AttorneyTrustService,
    });
    redis.kv.set(
      'trust:firm-email:att-1',
      JSON.stringify({
        code: '123456',
        domain: 'firm.com',
        email: 'a@firm.com',
        attempts: 0,
      }),
    );
    await expect(svc.confirm('att-1', '000000')).rejects.toBeDefined();
    await expect(svc.confirm('att-1', '123456')).resolves.toEqual({
      domain: 'firm.com',
    });
    expect(trust.onFirmEmailConfirmed).toHaveBeenCalledWith(
      'att-1',
      'firm.com',
    );
  });
});

/**
 * Verify 17.11 (batch 9): `'attorneyTrust' in db` is true for a transaction
 * client too, so trust notices were written outside their transaction.
 */
describe('AttorneyTrustService.notify — inside the caller’s transaction', () => {
  it('a transaction client is passed on to the notification', async () => {
    const root = { attorneyTrust: {} };
    const tx = { attorneyTrust: {} };
    const emit = jest.fn().mockResolvedValue(null);
    const svc = Object.create(AttorneyTrustService.prototype) as {
      notify(
        db: unknown,
        id: string,
        kind: string,
        extra: object,
      ): Promise<void>;
    };
    Object.assign(svc, { prisma: root, notifications: { emit } });
    await svc.notify(tx, 'att-1', 'level_up', {});
    await svc.notify(root, 'att-1', 'level_up', {});
    expect(emit.mock.calls[0][1]).toBe(tx);
    expect(emit.mock.calls[1][1]).toBeUndefined();
  });
});
