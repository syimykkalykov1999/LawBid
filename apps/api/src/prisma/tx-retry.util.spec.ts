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

  it('retries on a CockroachDB serialization failure (P2034) and eventually succeeds', async () => {
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
