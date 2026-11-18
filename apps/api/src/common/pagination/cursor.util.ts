import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../errors/error-code.enum';

/**
 * Keyset cursor for lists ordered by (created_at DESC, id DESC)
 * (.cursorrules: "Пагинация только cursor-based, offset запрещён"). The
 * cursor is opaque to clients: base64url of `{t: ISO timestamp, id}` of
 * the last row of the previous page.
 */
export interface CreatedAtCursor {
  createdAt: Date;
  id: string;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeCursor(cursor: CreatedAtCursor): string {
  return Buffer.from(
    JSON.stringify({ t: cursor.createdAt.toISOString(), id: cursor.id }),
  ).toString('base64url');
}

/** Throws 400 VALIDATION_ERROR (details.field = 'cursor') for anything
 * that is not a cursor this API issued. */
export function decodeCursor(raw: string): CreatedAtCursor {
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8'),
    ) as unknown;
    if (parsed !== null && typeof parsed === 'object') {
      const { t, id } = parsed as { t?: unknown; id?: unknown };
      const createdAt = typeof t === 'string' ? new Date(t) : undefined;
      if (
        createdAt &&
        !Number.isNaN(createdAt.getTime()) &&
        typeof id === 'string' &&
        UUID_RE.test(id)
      ) {
        return { createdAt, id };
      }
    }
  } catch {
    // Fall through to the validation error below.
  }
  throw new HttpException(
    {
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Invalid cursor.',
      details: { field: 'cursor' },
    },
    HttpStatus.BAD_REQUEST,
  );
}

/**
 * Rows strictly after the keyset cursor in (created_at DESC, id DESC)
 * order, as a Prisma `where` part (any model with `created_at` + `id`).
 * Row 126 (#1084, EXPLAIN ANALYZE on 300 000 posts): the tie-break OR alone
 * is only a Filter, so the index was read from the newest row down to the
 * cursor on every page (290 001 rows removed, 259 ms at depth 290 000, and
 * growing with the table). `created_at <= t` beside it is an Index Cond
 * range on the (created_at DESC, id DESC) index: the same rows, read from
 * the cursor on (2.2 ms). Prisma has no row comparison
 * `(created_at, id) < (t, id)`, so this is its equivalent.
 */
/** Later than any row: the first page's bound in [createdKeyset]. */
export const KEYSET_END = new Date('9999-12-31T23:59:59.999Z');

/**
 * Row 215 (second part): [createdBefore] for every page of a list that has
 * no other leading column, the first page included. Such lists page on a
 * `(created_at DESC, id DESC) WHERE created_at IS NOT NULL` index
 * (prisma/concurrent: partial, so Prisma leaves it out of its schema diff).
 * The planner may use a partial index only when the query implies its
 * predicate, and `created_at <= $1` does (a strict comparison is never true
 * for NULL); without a cursor nothing in the query mentions created_at, so
 * the first page bounds it by [KEYSET_END], which every row satisfies. The
 * rows are the same as with no bound (EXPLAIN in the PR: Index Only Scan,
 * 0.1 ms instead of a full scan and sort).
 */
export function createdKeyset(
  after: { t: string | Date; id: string } | undefined,
):
  | ReturnType<typeof createdBefore>
  | {
      AND: [{ created_at: { lte: Date } }];
    } {
  return after
    ? createdBefore(after)
    : { AND: [{ created_at: { lte: KEYSET_END } }] };
}

export function createdBefore(after: { t: string | Date; id: string }): {
  AND: [
    { created_at: { lte: Date } },
    {
      OR: [
        { created_at: { lt: Date } },
        { created_at: Date; id: { lt: string } },
      ];
    },
  ];
} {
  const t = new Date(after.t);
  return {
    AND: [
      { created_at: { lte: t } },
      {
        OR: [
          { created_at: { lt: t } },
          { created_at: t, id: { lt: after.id } },
        ],
      },
    ],
  };
}
