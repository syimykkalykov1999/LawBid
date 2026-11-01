import type { Prisma } from '@prisma/client';
import type {
  MessageSearchIndex,
  SearchTokenRow,
} from '../../common/secrets/message-search-index';

/**
 * The blind search token rows of a message (pure: no database). Load test
 * 2026-10-28: the send path computes them BEFORE its transaction, so the
 * conversation row lock is not held while Node hashes words.
 */
export function searchTokenRows(
  index: MessageSearchIndex | undefined,
  m: { id: string; conversation_id: string; type: string },
  shownText: string,
  prefixes: boolean,
): SearchTokenRow[] {
  return index?.rowsFor(m, shownText, prefixes) ?? [];
}

/** Writes prepared token rows through the transaction client [tx]. */
export async function writeSearchTokenRows(
  tx: Pick<Prisma.TransactionClient, 'messageSearchToken'>,
  rows: SearchTokenRow[],
): Promise<number> {
  if (rows.length === 0) return 0;
  await tx.messageSearchToken.createMany({ data: rows, skipDuplicates: true });
  return rows.length;
}

/**
 * BUG-1 (package N-12b): writes the blind search tokens of a message that
 * was just created, through the SAME transaction client [tx] — a message
 * and its tokens commit or roll back together. Returns how many rows were
 * written (0 without the index, or for a type with no text).
 */
export async function writeSearchTokens(
  tx: Pick<Prisma.TransactionClient, 'messageSearchToken'>,
  index: MessageSearchIndex | undefined,
  m: { id: string; conversation_id: string; type: string },
  shownText: string,
  prefixes: boolean,
): Promise<number> {
  return writeSearchTokenRows(
    tx,
    searchTokenRows(index, m, shownText, prefixes),
  );
}
