import { CaseCommentsService } from './case-comments.service';

/** Detective R2B-13 (14.11): two DELETEs of the same comment at once both
 * passed the check outside the transaction and both lowered the case's
 * comment counter. Now only the request that really deletes the row (a
 * conditional `updateMany … deleted_at: null`) moves the counters. */
describe('CaseCommentsService.remove under a double DELETE', () => {
  it('lowers the counter once', async () => {
    const row = {
      id: 'c1',
      author_id: 'u1',
      case_id: 'k1',
      parent_comment_id: null as string | null,
      status: 'published',
      deleted_at: null as Date | null,
      case: { client_id: 'owner' },
    };
    const db = {
      caseComment: {
        findFirst: jest.fn(() =>
          Promise.resolve(row.deleted_at ? null : { ...row }),
        ),
        update: jest.fn(({ data }: { data: { deleted_at: Date } }) => {
          row.deleted_at = data.deleted_at;
          return Promise.resolve(row);
        }),
        updateMany: jest.fn(
          ({
            where,
            data,
          }: {
            where: Record<string, unknown>;
            data: { deleted_at: Date };
          }) => {
            if (where.id === 'c1') {
              if (row.deleted_at) return Promise.resolve({ count: 0 });
              row.deleted_at = data.deleted_at;
              return Promise.resolve({ count: 1 });
            }
            return Promise.resolve({ count: 0 });
          },
        ),
      },
    };
    const prisma = {
      ...db,
      $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(db)),
    };
    const counters = { bump: jest.fn(() => Promise.resolve()) };
    const svc = new CaseCommentsService(
      prisma as never,
      {} as never,
      {} as never,
      counters as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    // Both requests read the live row before either deletes it.
    const first = { ...row };
    db.caseComment.findFirst
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce({ ...first });
    const user = { sub: 'u1' } as never;
    await Promise.all([svc.remove(user, 'c1'), svc.remove(user, 'c1')]);
    expect(counters.bump).toHaveBeenCalledTimes(1);
    expect(counters.bump).toHaveBeenCalledWith(
      'case',
      'k1',
      'comment_count',
      -1,
    );
  });
});
