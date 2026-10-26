import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { withTxRetry } from './tx-retry.util';
import type { PrismaService } from './prisma.service';

function makeSerializationError(): PrismaClientKnownRequestError {
  return new PrismaClientKnownRequestError('restart transaction', {
    code: 'P2034',
    clientVersion: 'test',
  });
}

describe('withTxRetry', () => {
  it('returns the result on first success without retrying', async () => {
    const $transaction = jest.fn().mockResolvedValue('ok');
    const prisma = { $transaction } as unknown as PrismaService;

    const result = await withTxRetry(prisma, () => Promise.resolve('ok'));

    expect(result).toBe('ok');
    expect($transaction).toHaveBeenCalledTimes(1);
  });

  it('retries on a serialization failure (P2034) and eventually succeeds', async () => {
    const $transaction = jest
      .fn()
      .mockRejectedValueOnce(makeSerializationError())
      .mockRejectedValueOnce(makeSerializationError())
      .mockResolvedValueOnce('ok-after-retry');
    const prisma = { $transaction } as unknown as PrismaService;

    const result = await withTxRetry(
      prisma,
      () => Promise.resolve('ok-after-retry'),
      {
        baseDelayMs: 1,
      },
    );

    expect(result).toBe('ok-after-retry');
    expect($transaction).toHaveBeenCalledTimes(3);
  });

  it('gives up after maxAttempts and rethrows the serialization error', async () => {
    const $transaction = jest.fn().mockRejectedValue(makeSerializationError());
    const prisma = { $transaction } as unknown as PrismaService;

    await expect(
      withTxRetry(prisma, () => Promise.resolve('never'), {
        maxAttempts: 2,
        baseDelayMs: 1,
      }),
    ).rejects.toBeInstanceOf(PrismaClientKnownRequestError);
    expect($transaction).toHaveBeenCalledTimes(2);
  });

  it('does not retry on a non-serialization error', async () => {
    const otherError = new Error('some other db error');
    const $transaction = jest.fn().mockRejectedValue(otherError);
    const prisma = { $transaction } as unknown as PrismaService;

    await expect(
      withTxRetry(prisma, () => Promise.resolve('never')),
    ).rejects.toBe(otherError);
    expect($transaction).toHaveBeenCalledTimes(1);
  });
});

describe('withTxRetry isolation option (DB-ops S5-7)', () => {
  const deadlock = () =>
    new PrismaClientKnownRequestError('deadlock detected', {
      code: 'P2010',
      clientVersion: 'test',
      meta: { code: '40P01' },
    });

  it('defaults to Serializable', async () => {
    const $transaction = jest.fn().mockResolvedValue('ok');
    await withTxRetry({ $transaction } as unknown as PrismaService, () =>
      Promise.resolve('ok'),
    );
    expect(($transaction.mock.calls[0] as unknown[])[1]).toMatchObject({
      isolationLevel: 'Serializable',
    });
  });

  it('readCommitted uses ReadCommitted and retries a deadlock', async () => {
    const $transaction = jest
      .fn()
      .mockRejectedValueOnce(deadlock())
      .mockResolvedValueOnce('ok');
    const out = await withTxRetry(
      { $transaction } as unknown as PrismaService,
      () => Promise.resolve('ok'),
      { isolation: 'readCommitted', baseDelayMs: 1, op: 'test.op' },
    );
    expect(out).toBe('ok');
    expect(($transaction.mock.calls[0] as unknown[])[1]).toMatchObject({
      isolationLevel: 'ReadCommitted',
    });
  });

  it('Serializable does not retry a deadlock (unchanged behaviour)', async () => {
    const $transaction = jest.fn().mockRejectedValue(deadlock());
    await expect(
      withTxRetry(
        { $transaction } as unknown as PrismaService,
        () => Promise.resolve('x'),
        { baseDelayMs: 1 },
      ),
    ).rejects.toBeInstanceOf(PrismaClientKnownRequestError);
    expect($transaction).toHaveBeenCalledTimes(1);
  });
});
