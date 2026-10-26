import { hashedBarNumber } from './account-anonymization.service';
import { DeletionNoticesService } from './deletion-notices.service';
import { DeletionStepsService } from './deletion-steps.service';
import { ErasureLedgerService } from './erasure-ledger.service';
import { deadlineFor } from '../../cli/breach-affected';

const logger = { setContext: jest.fn(), warn: jest.fn(), info: jest.fn() };

describe('hashedBarNumber', () => {
  it('is stable, state-scoped and hides the number', () => {
    const a = hashedBarNumber('ny', ' 12345 ');
    expect(a).toBe(hashedBarNumber('NY', '12345'));
    expect(a).not.toBe(hashedBarNumber('CA', '12345'));
    expect(a.startsWith('h:')).toBe(true);
    expect(a).not.toContain('12345');
  });
});

describe('DeletionNoticesService cancel token', () => {
  const config = {
    getOrThrow: () => 'secret',
    get: () => 'https://lawbid.test',
  };
  const svc = new DeletionNoticesService(
    {} as never,
    {} as never,
    config as never,
    {} as never,
    {} as never,
    logger as never,
  );

  it('verifies its own token and refuses tampering and expiry', () => {
    const t = svc.sign({ u: 'user-1', r: 1000, e: Date.now() + 10_000 });
    expect(svc.verify(t)?.u).toBe('user-1');
    expect(svc.verify(`${t}x`)).toBeNull();
    expect(svc.verify('nope')).toBeNull();
    const old = svc.sign({ u: 'user-1', r: 1000, e: 5 });
    expect(svc.verify(old)).toBeNull();
  });

  it('builds a link on the public base', () => {
    expect(svc.cancelUrl('u', new Date())).toMatch(
      /^https:\/\/lawbid\.test\/api\/v1\/privacy\/deletion\/cancel\/.+\..+$/,
    );
  });
});

describe('DeletionStepsService.run', () => {
  it('records failures instead of throwing', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const steps = new DeletionStepsService(
      { deletionStep: { upsert } } as never,
      logger as never,
    );
    expect(
      await steps.run('u', 'twilio', () => Promise.reject(new Error('boom'))),
    ).toBe('failed');
    expect(upsert.mock.calls[0][0].create).toMatchObject({
      step: 'twilio',
      status: 'failed',
      detail: 'boom',
    });
  });
});

describe('ErasureLedgerService', () => {
  it('copies unsynced rows to the bucket and marks them', async () => {
    const row = {
      user_id: 'u1',
      anonymized_at: new Date('2026-10-25T00:00:00Z'),
      reason: 'minor_confirmed',
    };
    const prisma = {
      erasureLedger: {
        findMany: jest.fn().mockResolvedValue([{ user_id: 'u1' }]),
        findUnique: jest.fn().mockResolvedValue(row),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const storage = {
      ready: jest.fn().mockResolvedValue(true),
      awsBucket: jest.fn().mockReturnValue('docs'),
      put: jest.fn().mockResolvedValue(undefined),
    };
    const svc = new ErasureLedgerService(
      prisma as never,
      storage as never,
      logger as never,
    );
    expect(await svc.syncPending()).toEqual({
      synced: 1,
      failed: 0,
      pending: 1,
    });
    expect(storage.put.mock.calls[0][1]).toBe('erasure-ledger/u1.json');
    expect(prisma.erasureLedger.update).toHaveBeenCalled();
  });
});

describe('breach deadlines', () => {
  it('uses 60 days for Texas and 30 for New York and unknown states', () => {
    const d = new Date('2026-10-01T00:00:00Z');
    expect(deadlineFor('TX', d).toISOString().slice(0, 10)).toBe('2026-11-30');
    expect(deadlineFor('NY', d).toISOString().slice(0, 10)).toBe('2026-10-31');
    expect(deadlineFor('OH', d).toISOString().slice(0, 10)).toBe('2026-10-31');
  });
});
