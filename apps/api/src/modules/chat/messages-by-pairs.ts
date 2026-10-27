import { Prisma, type ChatGroupMessage, type Message } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

/**
 * Live (not soft-deleted) messages named by (chat, id) pairs, e.g. the last
 * message of each chat in the chat list.
 *
 * `messages` is hash partitioned by chat. `id = ANY(..)` alone probes the
 * primary key of every partition, and the ORM's tuple form
 * `(conversation_id, id) IN (..)` expands to an OR that runs every arm in every
 * partition (measured: 3 ms for 20 pairs). Joining an unnest of the pairs
 * lets PostgreSQL prune to one partition per pair with a parameterized index
 * probe (numbers: docs/architecture/TABLE_PARTITIONING_READY.md).
 */
export async function messagesByPairs(
  prisma: PrismaService,
  pairs: { id: string; conversationId: string }[],
): Promise<Message[]> {
  if (pairs.length === 0) return [];
  return prisma.$queryRaw<Message[]>(Prisma.sql`
    SELECT m.*
    FROM unnest(${pairs.map((p) => p.id)}::UUID[],
                ${pairs.map((p) => p.conversationId)}::UUID[]) AS t(mid, cid)
    JOIN messages m ON m.id = t.mid AND m.conversation_id = t.cid
    WHERE m.deleted_at IS NULL`);
}

/** The same for group messages, hash partitioned by group. */
export async function groupMessagesByPairs(
  prisma: PrismaService,
  pairs: { id: string; groupId: string }[],
): Promise<ChatGroupMessage[]> {
  if (pairs.length === 0) return [];
  return prisma.$queryRaw<ChatGroupMessage[]>(Prisma.sql`
    SELECT m.*
    FROM unnest(${pairs.map((p) => p.id)}::UUID[],
                ${pairs.map((p) => p.groupId)}::UUID[]) AS t(mid, gid)
    JOIN chat_group_messages m ON m.id = t.mid AND m.group_id = t.gid
    WHERE m.deleted_at IS NULL`);
}
