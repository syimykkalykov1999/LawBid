import type { PrismaService } from '../../../prisma/prisma.service';

/** What a push / VoIP token row knows about the device's sign-in. */
export interface ChainRef {
  session_id: string | null;
  session_chain_id: string | null;
}

export interface ResolvedChains {
  /** The row's sign-in chain: its own, or (a row of an older release)
   * the chain of the session row it points to; null when neither is known. */
  chainOf: (row: ChainRef) => string | null;
  /** chain → its newest live session row (signed in, not expired). */
  live: Map<string, string>;
}

/**
 * 14.11 (DB scale review, finding 8): which of [userId]'s token rows
 * belong to a device that is still signed in. Two queries by id, no join:
 * tokens and sessions are different families (shard-ready step 0), so a
 * SQL join between them sees nothing once they live in different databases.
 */
export async function resolveChains(
  prisma: PrismaService,
  userId: string,
  rows: readonly ChainRef[],
  now: Date = new Date(),
): Promise<ResolvedChains> {
  const legacyIds = [
    ...new Set(
      rows
        .filter((r) => !r.session_chain_id && r.session_id)
        .map((r) => r.session_id as string),
    ),
  ];
  const viaSession = new Map<string, string>();
  if (legacyIds.length > 0) {
    const own = await prisma.session.findMany({
      where: { id: { in: legacyIds } },
      select: { id: true, session_chain_id: true },
    });
    for (const s of own) viaSession.set(s.id, s.session_chain_id);
  }
  const chainOf = (r: ChainRef): string | null =>
    r.session_chain_id ??
    (r.session_id ? (viaSession.get(r.session_id) ?? null) : null);
  const chains = [
    ...new Set(rows.map(chainOf).filter((c): c is string => c !== null)),
  ];
  const live = new Map<string, string>();
  if (chains.length > 0) {
    const alive = await prisma.session.findMany({
      where: {
        user_id: userId,
        session_chain_id: { in: chains },
        revoked_at: null,
        expires_at: { gt: now },
      },
      orderBy: { created_at: 'desc' },
      select: { id: true, session_chain_id: true },
    });
    for (const s of alive) {
      if (!live.has(s.session_chain_id)) live.set(s.session_chain_id, s.id);
    }
  }
  return { chainOf, live };
}
