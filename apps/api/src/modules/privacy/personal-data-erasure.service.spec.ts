import { SWEEPS } from './personal-data-registry';
import { PersonalDataErasureService } from './personal-data-erasure.service';

const USER = '11111111-1111-4111-8111-111111111111';

function build(opts: { hold?: boolean; failModel?: string } = {}) {
  const rows = new Map<string, Record<string, unknown>>();
  const deletes: Record<string, jest.Mock> = {};
  const failing = { model: opts.failModel };
  const prisma: Record<string, unknown> = {
    user: { findUnique: jest.fn().mockResolvedValue({ home_region: 'us' }) },
    legalHold: {
      findFirst: jest.fn().mockResolvedValue(opts.hold ? { id: 'h' } : null),
    },
    deletionStep: {
      upsert: jest.fn(({ where, create, update }) => {
        const key = where.user_id_step.step as string;
        const prev = rows.get(key);
        rows.set(key, prev ? { ...prev, ...update } : { ...create });
        return Promise.resolve(rows.get(key));
      }),
      findMany: jest.fn(() =>
        Promise.resolve(
          [...rows.entries()].map(([step, r]) => ({ step, ...r })),
        ),
      ),
    },
    file: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    mediaModerationCheck: { count: jest.fn().mockResolvedValue(0) },
    videoAsset: { count: jest.fn().mockResolvedValue(0) },
    $queryRaw: jest.fn().mockResolvedValue([{ on: false }]),
    $executeRaw: jest.fn().mockResolvedValue(1),
  };
  for (const model of Object.keys(SWEEPS)) {
    const fn = jest.fn(() =>
      failing.model === model
        ? Promise.reject(new Error('boom'))
        : Promise.resolve({ count: 2 }),
    );
    deletes[model] = fn;
    prisma[model[0].toLowerCase() + model.slice(1)] = { deleteMany: fn };
  }
  const redis = {
    del: jest.fn().mockResolvedValue(1),
    scan: jest.fn().mockResolvedValue(['0', []]),
  };
  const release = { release: jest.fn(), purge: jest.fn() };
  const logger = { setContext: jest.fn(), error: jest.fn(), info: jest.fn() };
  const svc = new PersonalDataErasureService(
    prisma as never,
    release as never,
    redis as never,
    logger as never,
  );
  return { svc, rows, deletes, redis, failing, prisma };
}

describe('PersonalDataErasureService', () => {
  it('walks every store, records each one and issues a certificate', async () => {
    const { svc, deletes, redis } = build();
    const out = await svc.run(USER);
    expect(out.completed).toBe(true);
    expect(out.certificate?.userId).toBe(USER);
    expect(out.certificate?.digest).toMatch(/^[0-9a-f]{64}$/);
    const { stores } = (await svc.certificateOf(USER))!;
    for (const id of [
      'legal_hold',
      'database:primary',
      'database:global',
      'object_storage',
      'cdn_cache',
      'video',
      'push',
      'redis',
      'search_index',
      'analytics',
      'archive',
      'ledger',
      'audit',
    ]) {
      expect(stores[id]).toBeDefined();
    }
    expect(stores.ledger.status).toBe('retained');
    expect(stores.cdn_cache.status).toBe('not_configured');
    expect(stores.search_index.status).toBe('skipped');
    expect(stores.push.count).toBe(4);
    expect(deletes.Notification).toHaveBeenCalledWith({
      where: { user_id: USER },
    });
    expect(deletes.UserBlock).toHaveBeenCalledWith({
      where: { OR: [{ blocker_id: USER }, { blocked_id: USER }] },
    });
    expect(redis.del).toHaveBeenCalled();
    expect((await svc.certificateOf(USER))!.status).toBe('completed');
  });

  it('is idempotent: a second call returns the same certificate and sweeps nothing', async () => {
    const { svc, deletes } = build();
    const first = await svc.run(USER);
    deletes.Notification.mockClear();
    const second = await svc.run(USER);
    expect(second.certificate?.certificateId).toBe(
      first.certificate?.certificateId,
    );
    expect(deletes.Notification).not.toHaveBeenCalled();
  });

  it('resumes: a failed store is retried, finished stores are not repeated', async () => {
    const { svc, deletes, failing } = build({ failModel: 'PushToken' });
    const first = await svc.run(USER);
    expect(first.completed).toBe(false);
    expect(first.failed).toContain('database:primary');
    expect((await svc.certificateOf(USER))!.status).toBe('failed');
    const { stores } = (await svc.certificateOf(USER))!;
    expect(stores['database:primary'].status).toBe('failed');
    expect(stores.push.status).toBe('failed');
    expect(stores.redis.status).toBe('done');
    failing.model = undefined;
    deletes.UserIdentifier.mockClear();
    const second = await svc.run(USER);
    expect(second.completed).toBe(true);
    // the global store was already final: not swept again
    expect(deletes.UserIdentifier).not.toHaveBeenCalled();
  });

  it('stops at an active legal hold and touches nothing', async () => {
    const { svc, deletes } = build({ hold: true });
    const out = await svc.run(USER);
    expect(out.completed).toBe(false);
    expect(out.failed).toEqual(['legal_hold']);
    expect((await svc.certificateOf(USER))!.status).toBe('blocked');
    expect(deletes.Notification).not.toHaveBeenCalled();
  });

  it('queues a search rebuild when the engine is on', async () => {
    const { svc, prisma } = build();
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ on: true }]);
    await svc.run(USER);
    const { stores } = (await svc.certificateOf(USER))!;
    expect(stores.search_index.status).toBe('done');
    expect(prisma.$executeRaw).toHaveBeenCalled();
  });
});
