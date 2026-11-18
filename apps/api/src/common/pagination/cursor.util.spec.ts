import { HttpException } from '@nestjs/common';
import {
  createdBefore,
  createdKeyset,
  decodeCursor,
  encodeCursor,
  KEYSET_END,
} from './cursor.util';

/** Row 126 follow-up: createdBefore() must pick exactly the rows of the old
 * `created_at < t OR (created_at = t AND id < id)` rule, ties included. */
describe('createdBefore (keyset as an index range)', () => {
  type Row = { created_at: Date; id: string };
  type W = Record<string, unknown>;
  const matches = (w: W, r: Row): boolean => {
    if (Array.isArray(w.AND)) return (w.AND as W[]).every((x) => matches(x, r));
    if (Array.isArray(w.OR)) return (w.OR as W[]).some((x) => matches(x, r));
    const c = w.created_at as Date | { lt?: Date; lte?: Date };
    const ok =
      c instanceof Date
        ? r.created_at.getTime() === c.getTime()
        : (c.lt === undefined || r.created_at < c.lt) &&
          (c.lte === undefined || r.created_at <= c.lte);
    const id = w.id as { lt: string } | undefined;
    return ok && (id === undefined || r.id < id.lt);
  };
  const when = (h: number) => new Date(Date.UTC(2026, 9, 1, h));
  const rows: Row[] = Array.from({ length: 400 }, (_, i) => ({
    created_at: when(i % 7),
    id: `id-${String((i * 37) % 400).padStart(3, '0')}`,
  }));

  it.each([0, 3, 6, 7])('same rows as the OR rule at hour %i', (h) => {
    for (const id of ['id-000', 'id-150', 'id-399', 'id-999']) {
      const old = rows.filter(
        (r) =>
          r.created_at < when(h) ||
          (r.created_at.getTime() === when(h).getTime() && r.id < id),
      );
      // a Date and its ISO string give the same condition
      for (const t of [when(h), when(h).toISOString()]) {
        expect(
          rows.filter((r) => matches(createdBefore({ t, id }), r)),
        ).toEqual(old);
      }
    }
  });

  it('carries the range bound next to the tie-break', () => {
    const t = when(2);
    expect(createdBefore({ t, id: 'x' })).toEqual({
      AND: [
        { created_at: { lte: t } },
        { OR: [{ created_at: { lt: t } }, { created_at: t, id: { lt: 'x' } }] },
      ],
    });
  });

  // Row 215 (second part): the first page bounds created_at too, so a
  // `WHERE created_at IS NOT NULL` index is usable; it keeps every row.
  it('createdKeyset: page 1 keeps every row, later pages = createdBefore', () => {
    expect(createdKeyset(undefined)).toEqual({
      AND: [{ created_at: { lte: KEYSET_END } }],
    });
    expect(rows.filter((r) => matches(createdKeyset(undefined), r))).toEqual(
      rows,
    );
    const after = { t: when(3), id: 'id-150' };
    expect(createdKeyset(after)).toEqual(createdBefore(after));
  });

  it('createdKeyset: paging 7 at a time over ties returns each row once', () => {
    const sorted = [...rows].sort(
      (a, b) =>
        b.created_at.getTime() - a.created_at.getTime() ||
        (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
    );
    const seen: Row[] = [];
    let after: { t: Date; id: string } | undefined;
    for (;;) {
      const page = sorted
        .filter((r) => matches(createdKeyset(after), r))
        .slice(0, 7);
      if (page.length === 0) break;
      seen.push(...page);
      const last = page[page.length - 1];
      after = { t: last.created_at, id: last.id };
    }
    expect(seen).toEqual(sorted);
  });
});

describe('created_at/id keyset cursor', () => {
  const id = '3f2b8c1e-8d4a-4b5e-9c6f-0a1b2c3d4e5f';

  it('round-trips', () => {
    const createdAt = new Date('2026-09-27T10:11:12.345Z');
    expect(decodeCursor(encodeCursor({ createdAt, id }))).toEqual({
      createdAt,
      id,
    });
  });

  it.each([
    'not-base64-json',
    Buffer.from('{"t":"nope","id":"x"}').toString('base64url'),
    Buffer.from('{"t":"2026-01-01T00:00:00Z","id":"1; DROP"}').toString(
      'base64url',
    ),
    Buffer.from('null').toString('base64url'),
  ])('rejects %s with VALIDATION_ERROR', (raw) => {
    try {
      decodeCursor(raw);
      throw new Error('expected a throw');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(400);
      expect((error as HttpException).getResponse()).toMatchObject({
        code: 'VALIDATION_ERROR',
        details: { field: 'cursor' },
      });
    }
  });
});
