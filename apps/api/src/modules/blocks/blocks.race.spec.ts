import { BlocksService } from './blocks.service';

/**
 * Verify batch 7 (BL1, BL2, 2026-11-17): a block and a follow of the same
 * two people take one per-pair advisory lock, so a follow can never survive
 * the block; the block also forgets the cached "may watch the presence"
 * answers both ways, so the next announcement drops the watcher.
 */
describe('BlocksService.block (per-pair lock, presence)', () => {
  function make() {
    const isolation: (string | undefined)[] = [];
    const tx = {
      $executeRaw: jest.fn(() => Promise.resolve(1)),
      userBlock: { createMany: jest.fn(() => Promise.resolve({ count: 1 })) },
      follow: {
        findMany: jest.fn(() => Promise.resolve([])),
        deleteMany: jest.fn(() => Promise.resolve({ count: 0 })),
      },
    };
    const prisma = {
      user: {
        findFirst: jest.fn(() => Promise.resolve({ id: 'b' })),
        findMany: jest.fn(() => Promise.resolve([])),
      },
      $transaction: jest.fn(
        (fn: (t: typeof tx) => unknown, o?: { isolationLevel?: string }) => {
          isolation.push(o?.isolationLevel);
          return fn(tx);
        },
      ),
    };
    const cache = {
      del: jest.fn(() => Promise.resolve(1)),
      set: jest.fn(() => Promise.resolve('OK')),
    };
    const main = { del: jest.fn(() => Promise.resolve(1)) };
    const svc = new BlocksService(
      prisma as never,
      {} as never,
      { bump: jest.fn() } as never,
      cache as never,
      main as never,
    );
    return { svc, tx, main, isolation };
  }

  it('takes the per-pair lock first, in a read-committed transaction', async () => {
    const { svc, tx, isolation } = make();
    await svc.block('a', 'b');
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    const call = tx.$executeRaw.mock.calls[0] as unknown as [
      TemplateStringsArray,
      ...unknown[],
    ];
    expect(call[0].join('?')).toContain('pg_advisory_xact_lock');
    expect(call[1]).toBe('block-pair:a:b');
    // Statements after the lock see the follow a racing tx just committed.
    expect(isolation).toEqual(['ReadCommitted']);
  });

  it('the key is the same whichever side acts (min / max of the ids)', async () => {
    const { svc, tx } = make();
    await svc.block('b', 'a');
    const call = tx.$executeRaw.mock.calls[0] as unknown as unknown[];
    expect(call[1]).toBe('block-pair:a:b');
  });

  it('drops the cached presence permission both ways', async () => {
    const { svc, main } = make();
    await svc.block('a', 'b');
    const keys = (main.del.mock.calls as unknown as string[][]).flat();
    expect(keys).toEqual(
      expect.arrayContaining(['presence:perm:a:b', 'presence:perm:b:a']),
    );
  });
});
