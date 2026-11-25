import { NotificationsService } from '../modules/notifications/notifications.service';
import { afterCommit } from './after-commit';
import { PrismaService, routingOf } from './prisma.service';
import { withTxRetry } from './tx-retry.util';

/** Pack C (round 2 #3, 25.11): `case:update` leaves only after COMMIT. */
describe('afterCommit through PrismaService.$transaction', () => {
  const savedUrl = process.env.DATABASE_URL;
  let svc: PrismaService;
  let real: Record<string, unknown>;
  beforeAll(() => {
    delete process.env.DATABASE_URL_SHARDS;
    process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/one';
    svc = new PrismaService();
    real = routingOf(svc).realClient() as unknown as Record<string, unknown>;
  });
  afterAll(async () => {
    await svc.$disconnect();
    process.env.DATABASE_URL = savedUrl;
  });
  afterEach(() => {
    delete real.$transaction;
  });

  /** A fake interactive transaction: runs fn, then "commits" or throws. */
  function fakeTransaction(
    tx: object,
    failWith?: () => Error | undefined,
  ): void {
    Object.defineProperty(real, '$transaction', {
      configurable: true,
      writable: true,
      value: async (fn: (t: unknown) => unknown) => {
        const out = await fn(tx);
        const err = failWith?.();
        if (err) throw err;
        return out;
      },
    });
  }

  function notificationsWith(toUsers: jest.Mock): NotificationsService {
    return new NotificationsService(svc, undefined, undefined, undefined, {
      toUsers,
    } as never);
  }

  const bidAccepted = {
    type: 'bid_accepted',
    recipientId: 'attorney',
    payload: { caseId: 'c', bidId: 'b' },
  } as never;

  it('runs the callback after the commit, not before', async () => {
    fakeTransaction({});
    const hook = jest.fn();
    await svc.$transaction((tx) => {
      expect(afterCommit(tx, hook)).toBe(true);
      expect(hook).not.toHaveBeenCalled();
      return Promise.resolve();
    });
    expect(hook).toHaveBeenCalledTimes(1);
  });

  it('a failed COMMIT drops the callback', async () => {
    fakeTransaction({}, () => new Error('commit failed'));
    const hook = jest.fn();
    await expect(
      svc.$transaction((tx) => {
        afterCommit(tx, hook);
        return Promise.resolve();
      }),
    ).rejects.toThrow('commit failed');
    expect(hook).not.toHaveBeenCalled();
  });

  it('a withTxRetry retry (40001) runs it once, from the attempt that committed', async () => {
    let attempt = 0;
    fakeTransaction({}, () => {
      attempt += 1;
      return attempt === 1
        ? Object.assign(new Error('could not serialize'), {
            meta: { code: '40001' },
          })
        : undefined;
    });
    const hook = jest.fn();
    await withTxRetry(
      svc,
      (tx) => {
        afterCommit(tx, hook);
        return Promise.resolve();
      },
      { baseDelayMs: 1 },
    );
    expect(attempt).toBe(2);
    expect(hook).toHaveBeenCalledTimes(1);
  });

  it('emit inside a rolled-back transaction publishes no case:update', async () => {
    fakeTransaction(
      { notification: { create: jest.fn().mockResolvedValue({ id: 'n1' }) } },
      () => new Error('rolled back'),
    );
    const toUsers = jest.fn();
    const notifications = notificationsWith(toUsers);
    await expect(
      svc.$transaction(async (t) => {
        await notifications.emit(bidAccepted, t);
      }),
    ).rejects.toThrow('rolled back');
    // The old 300 ms timer fired here regardless of the rollback.
    await new Promise((r) => setTimeout(r, 400));
    expect(toUsers).not.toHaveBeenCalled();
  });

  it('a committed emit publishes exactly once, after the commit', async () => {
    fakeTransaction({
      notification: { create: jest.fn().mockResolvedValue({ id: 'n1' }) },
    });
    const toUsers = jest.fn();
    const notifications = notificationsWith(toUsers);
    await svc.$transaction(async (t) => {
      await notifications.emit(bidAccepted, t);
      expect(toUsers).not.toHaveBeenCalled();
    });
    expect(toUsers).toHaveBeenCalledTimes(1);
    expect(toUsers).toHaveBeenCalledWith(
      ['attorney'],
      'case:update',
      expect.objectContaining({ caseId: 'c', kind: 'bid_accepted' }),
    );
  });
});
