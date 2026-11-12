import { BadRequestException } from '@nestjs/common';
import { eachIdInChunks } from '../../modules/admin-content/bulk.util';
import {
  assertStaffBulkCap,
  BULK_CHUNK,
  chunks,
  isOwnerAdmin,
} from './admin-bulk';

/** Owner 2026-11-12: no cap on the owner's own bulk lists. */
describe('admin bulk limits', () => {
  const owner = { adminRole: 'super_admin' };
  const staff = { adminRole: 'moderator' };

  it('the owner is the super admin', () => {
    expect(isOwnerAdmin(owner)).toBe(true);
    expect(isOwnerAdmin(staff)).toBe(false);
    expect(isOwnerAdmin(null)).toBe(false);
  });

  it('staff keep the cap; the owner sends any number', () => {
    const many = Array.from({ length: 501 }, (_, i) => `${i}`);
    expect(() =>
      assertStaffBulkCap(staff, many.slice(0, 500), 500),
    ).not.toThrow();
    expect(() => assertStaffBulkCap(staff, many, 500)).toThrow(
      BadRequestException,
    );
    expect(() => assertStaffBulkCap(owner, many, 500)).not.toThrow();
    try {
      assertStaffBulkCap(staff, many, 500, 'leadIds');
    } catch (e) {
      expect((e as BadRequestException).getResponse()).toMatchObject({
        code: 'VALIDATION_ERROR',
        details: { field: 'leadIds', max: 500 },
      });
    }
  });

  it('chunks split in order', () => {
    expect(chunks([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunks([])).toEqual([]);
  });

  it('eachIdInChunks: every distinct id once, a callback per chunk', async () => {
    const ids = Array.from({ length: BULK_CHUNK * 2 + 7 }, (_, i) => `id${i}`);
    const seen: string[] = [];
    const parts: Array<{ n: number; index: number; of: number }> = [];
    const out = await eachIdInChunks(
      [...ids, 'id0'],
      (id) => {
        seen.push(id);
        return id === 'id3'
          ? Promise.reject(new Error('x'))
          : Promise.resolve();
      },
      (part, chunk) => {
        parts.push({ n: part.done.length + part.skipped.length, ...chunk });
        return Promise.resolve();
      },
    );
    expect(seen).toEqual(ids);
    expect(out.done).toHaveLength(ids.length - 1);
    expect(out.skipped).toEqual([{ id: 'id3', reason: 'failed' }]);
    expect(parts).toEqual([
      { n: BULK_CHUNK, index: 1, of: 3 },
      { n: BULK_CHUNK, index: 2, of: 3 },
      { n: 7, index: 3, of: 3 },
    ]);
  });
});
