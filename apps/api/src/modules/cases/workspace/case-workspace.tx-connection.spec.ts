import { CaseWorkspaceService } from './case-workspace.service';

/**
 * Row 69 (KE 123): linking files to a case task / update runs inside the
 * task's transaction. The ownership check of every file read the root
 * client there, i.e. one more pool connection per file while the
 * transaction held its own. It is handed the transaction now.
 */
describe('CaseWorkspaceService.attach inside a transaction (row 69)', () => {
  it('checks every file on the transaction', async () => {
    const assertAttachable = jest.fn((...a: unknown[]) =>
      Promise.resolve({ id: a[1], mime: 'image/jpeg', size_bytes: 10 }),
    );
    const assertFitsPlace = jest.fn(() => Promise.resolve());
    const svc = new CaseWorkspaceService(
      {} as never,
      { assertAttachable, assertFitsPlace } as never,
      {} as never,
    );
    const tx = {
      casePhoto: {
        aggregate: jest.fn(() => Promise.resolve({ _max: { position: 2 } })),
        createMany: jest.fn(() => Promise.resolve({ count: 2 })),
      },
    };
    await (
      svc as unknown as {
        attach(...a: unknown[]): Promise<void>;
      }
    ).attach(
      tx,
      'u1',
      'c1',
      [{ fileId: 'f1' }, { fileId: 'f2' }],
      'task',
      't1',
    );
    expect(assertAttachable).toHaveBeenCalledTimes(2);
    for (const call of assertAttachable.mock.calls) expect(call[3]).toBe(tx);
    expect(tx.casePhoto.createMany).toHaveBeenCalledTimes(1);
  });
});
