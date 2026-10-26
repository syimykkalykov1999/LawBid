/**
 * Owner 2026-10-15: "page after this row" for lists ordered by a number and
 * then by newest (rating, helpful votes, downloads). The database jumps to
 * the key through the index instead of reading and throwing away every row
 * before page N (offset paging gets slower with every page).
 *
 * The cursor is base64url JSON `[rank, createdAtISO, id]`. A cursor of an
 * older app (a plain number or `o:N` offset) does not decode here, so the
 * caller keeps its old offset path for it.
 */
export interface RankedKey {
  rank: number;
  createdAt: Date;
  id: string;
}

export function encodeRankedCursor(k: RankedKey): string {
  return Buffer.from(
    JSON.stringify([k.rank, k.createdAt.toISOString(), k.id]),
  ).toString('base64url');
}

export function decodeRankedCursor(raw: string): RankedKey | undefined {
  try {
    const [rank, at, id] = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8'),
    ) as [number, string, string];
    const createdAt = new Date(at);
    if (
      !Number.isInteger(rank) ||
      typeof id !== 'string' ||
      id.length === 0 ||
      Number.isNaN(createdAt.getTime())
    ) {
      return undefined;
    }
    return { rank, createdAt, id };
  } catch {
    return undefined;
  }
}

/**
 * Prisma `where` that keeps only rows strictly after [k] when the order is
 * `[{ [field]: dir }, { created_at: 'desc' }, { id: 'desc' }]`.
 */
export function rankedAfter<F extends string>(
  field: F,
  dir: 'asc' | 'desc',
  k: RankedKey,
) {
  const beyond = dir === 'desc' ? 'lt' : 'gt';
  return {
    OR: [
      { [field]: { [beyond]: k.rank } },
      {
        [field]: k.rank,
        OR: [
          { created_at: { lt: k.createdAt } },
          { created_at: k.createdAt, id: { lt: k.id } },
        ],
      },
    ],
  };
}
