import type { Prisma } from '@prisma/client';
import type { MessageSearchIndex } from '../../common/secrets/message-search-index';

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
  const rows = index?.rowsFor(m, shownText, prefixes) ?? [];
  if (rows.length === 0) return 0;
  await tx.messageSearchToken.createMany({ data: rows, skipDuplicates: true });
  return rows.length;
}
