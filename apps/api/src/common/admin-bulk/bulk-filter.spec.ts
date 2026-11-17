import { BadRequestException } from '@nestjs/common';
import {
  bulkFilterCap,
  bulkFilterPreview,
  bulkTargets,
  idsByFilter,
} from './bulk-filter';

/** Owner 14.11 (row 179 follow-up B6): «Выбрать всё по фильтру» on the
 * cases / content / media / templates lists is resolved on the server, as
 * the users page does (S18-10), instead of the browser walking pages. */
describe('bulk by filter', () => {
  const owner = { id: 'o', ip: null, adminRole: 'super_admin' };
  const staff = { id: 's', ip: null, adminRole: 'moderator' };
  const rows = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `id${i}` }));

  /** A keyset reader over [n] rows, as Prisma reads them. */
  function reader(n: number) {
    const all = rows(n);
    return jest.fn(
      ({
        take,
        cursor,
        skip,
      }: {
        take: number;
        cursor?: { id: string };
        skip?: number;
      }) => {
        const at = cursor ? all.findIndex((r) => r.id === cursor.id) : 0;
        const from = at + (skip ?? 0);
        return Promise.resolve(all.slice(from, from + take));
      },
    );
  }

  it('no cap: every match, pages of at most 500 ids', async () => {
    const read = reader(1201);
    const r = await idsByFilter(read, null);
    expect(r).toMatchObject({ matched: 1201, capped: false });
    expect(r.ids).toHaveLength(1201);
    expect(new Set(r.ids).size).toBe(1201);
    for (const [a] of read.mock.calls) expect(a.take).toBeLessThanOrEqual(500);
  });

  it('a cap reads cap + 1 ids at most and says «capped»', async () => {
    const read = reader(5000);
    const r = await idsByFilter(read, 1200);
    expect(r).toMatchObject({ matched: 1200, capped: true });
    expect(r.ids).toHaveLength(1200);
    const read2 = read.mock.calls.reduce((s, [a]) => s + a.take, 0);
    expect(read2).toBe(1201);
  });

  it('exactly the cap is not «capped»', async () => {
    const r = await idsByFilter(reader(1200), 1200);
    expect(r).toMatchObject({ matched: 1200, capped: false });
  });

  it('the owner has no cap; staff get admin.bulk_select_cap, 0 = none', async () => {
    const settings = (n: number) => ({
      number: jest.fn().mockResolvedValue(n),
    });
    expect(await bulkFilterCap(owner, settings(10) as never)).toBeNull();
    expect(await bulkFilterCap(staff, settings(10) as never)).toBe(10);
    expect(await bulkFilterCap(staff, settings(0) as never)).toBeNull();
  });

  it('bulkTargets: exactly one of ids or filter', async () => {
    const base = {
      admin: staff,
      staffMax: 500,
      resolve: jest.fn(),
      auditAction: 'x.bulk_filter',
      targetType: 'x_filter',
    };
    await expect(bulkTargets({ ...base })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      bulkTargets({ ...base, ids: ['a'], filter: {} }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(base.resolve).not.toHaveBeenCalled();
  });

  it('bulkTargets: explicit ids keep the staff cap of the list', async () => {
    const ids = rows(501).map((r) => r.id);
    const base = {
      staffMax: 500,
      resolve: jest.fn(),
      auditAction: 'x.bulk_filter',
      targetType: 'x_filter',
      ids,
    };
    await expect(bulkTargets({ ...base, admin: staff })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(bulkTargets({ ...base, admin: owner })).resolves.toEqual(ids);
  });

  it('bulkTargets: a filter is resolved with the admin cap and audited once', async () => {
    const record = jest.fn().mockResolvedValue(undefined);
    const resolve = jest
      .fn()
      .mockResolvedValue({ ids: ['a', 'b'], matched: 2, capped: true });
    const ids = await bulkTargets({
      admin: staff,
      filter: { q: 'x' },
      staffMax: 500,
      settings: { number: jest.fn().mockResolvedValue(2) },
      resolve,
      audit: { record },
      auditAction: 'admin.cases.bulk_filter',
      targetType: 'case_filter',
      bulkAction: 'hide',
    });
    expect(ids).toEqual(['a', 'b']);
    expect(resolve).toHaveBeenCalledWith(2);
    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0][0]).toMatchObject({
      adminId: 's',
      action: 'admin.cases.bulk_filter',
      targetType: 'case_filter',
      targetId: null,
      after: {
        action: 'hide',
        filter: { q: 'x' },
        matched: 2,
        capped: true,
        processed: 2,
      },
    });
  });

  it('preview: matched, capped and the cap in force (null = none)', async () => {
    const resolve = jest
      .fn()
      .mockResolvedValue({ ids: ['a'], matched: 1, capped: false });
    await expect(bulkFilterPreview(owner, undefined, resolve)).resolves.toEqual(
      { matched: 1, capped: false, cap: null },
    );
    expect(resolve).toHaveBeenCalledWith(null);
  });
});
