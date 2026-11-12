import { BadRequestException } from '@nestjs/common';
import { AdminContentBulkService } from './admin-content-bulk.service';
import { AdminContentService } from './admin-content.service';
import { BULK_MAX } from './admin-content.dto';

/** Owner 2026-11-12: no cap on the owner's bulk moderation lists; the
 * server works through them in chunks of 500. */
describe('admin content bulk without a cap for the owner', () => {
  const owner = { id: 'o', ip: null, adminRole: 'super_admin' } as never;
  const staff = { id: 's', ip: null, adminRole: 'moderator' } as never;
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);

  function bulk() {
    const record = jest.fn().mockResolvedValue(undefined);
    const svc = Object.create(
      AdminContentBulkService.prototype,
    ) as AdminContentBulkService;
    Object.assign(svc, { audit: { record } });
    const one = jest
      .spyOn(svc as unknown as { one: () => Promise<void> }, 'one')
      .mockResolvedValue(undefined);
    return { svc, record, one };
  }

  it('the owner removes 1 201 posts: three chunks, one audit row each', async () => {
    const { svc, record, one } = bulk();
    const out = await svc.apply(owner, 'remove', 'post', ids(1201), 'reason!!');
    expect(out.done).toHaveLength(1201);
    expect(one).toHaveBeenCalledTimes(1201);
    expect(record).toHaveBeenCalledTimes(3);
    const rows = record.mock.calls.map(
      ([r]: [{ after: { done: string[]; chunk?: unknown } }]) => r.after,
    );
    expect(rows.map((a) => a.done.length)).toEqual([500, 500, 201]);
    expect(rows[2].chunk).toEqual({ index: 3, of: 3 });
  });

  it('staff keep BULK_MAX; one chunk keeps the old single audit row', async () => {
    const { svc, record, one } = bulk();
    await expect(
      svc.apply(staff, 'remove', 'post', ids(BULK_MAX + 1), 'reason!!'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(one).not.toHaveBeenCalled();
    await svc.apply(staff, 'remove', 'post', ids(3), 'reason!!');
    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0][0].after).not.toHaveProperty('chunk');
  });

  it('classifyPosts reads and writes at most 500 ids a query', async () => {
    const findMany = jest
      .fn()
      .mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(
          where.id.in
            .filter((id) => id !== 'p7')
            .map((id) => ({ id, practice_area_id: null, kind: 'post' })),
        ),
      );
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const svc = Object.create(
      AdminContentService.prototype,
    ) as AdminContentService;
    Object.assign(svc, { prisma: { post: { findMany, updateMany } } });
    const out = await svc.classifyPosts(ids(1100), 'legal');
    expect(findMany).toHaveBeenCalledTimes(3);
    expect(updateMany).toHaveBeenCalledTimes(3);
    for (const [a] of findMany.mock.calls as [
      { where: { id: { in: string[] } } },
    ][]) {
      expect(a.where.id.in.length).toBeLessThanOrEqual(500);
    }
    expect(out.done).toHaveLength(1099);
    expect(out.skipped).toEqual([{ id: 'p7', reason: 'not_found' }]);
  });
});
