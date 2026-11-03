import type { Prisma } from '@prisma/client';

/**
 * What a stored chat message changes around it, in ONE statement inside the
 * sender's transaction: the chat's "last message", a removed chat coming back
 * for both sides, and the sender's own message counting as read by them.
 *
 * Load test 2026-11-02 (docs/perf/LOAD_RESILIENCE_2026-11-02.md §2): these
 * were three Prisma calls (three round trips) while the chat row stayed
 * locked by the send; on a busy node every round trip stretched the lock and
 * the senders queued behind it ate the connection pool (P2028). One UPDATE
 * on the participants (two data-modifying CTEs on the same row would apply
 * only one of them): the sender's row gets its read marker, the other rows
 * only lose `hidden_at`. Times are `clock_timestamp()` (the moment of the
 * write, as `new Date()` was), not `now()` (the start of a transaction that
 * may have waited seconds for the chat lock).
 */
export async function recordSentMessage(
  tx: Pick<Prisma.TransactionClient, '$executeRaw'>,
  m: { conversationId: string; messageId: string; createdAt: Date },
  senderId: string,
): Promise<void> {
  const touched = await tx.$executeRaw`
    WITH c AS (
      UPDATE conversations
         SET last_message_at = ${m.createdAt}::timestamptz,
             last_message_id = ${m.messageId}::uuid,
             updated_at = clock_timestamp()
       WHERE id = ${m.conversationId}::uuid
    )
    UPDATE conversation_participants
       SET hidden_at = NULL,
           last_read_message_id = CASE WHEN user_id = ${senderId}::uuid
                                       THEN ${m.messageId}::uuid
                                       ELSE last_read_message_id END,
           last_read_at = CASE WHEN user_id = ${senderId}::uuid
                               THEN clock_timestamp() ELSE last_read_at END,
           updated_at = clock_timestamp()
     WHERE conversation_id = ${m.conversationId}::uuid
       AND (hidden_at IS NOT NULL OR user_id = ${senderId}::uuid)`;
  // The sender's own row is always among the updated ones; without it the
  // send is rolled back, as the Prisma `update` it replaces did (P2025).
  if (touched === 0) {
    throw new Error(
      `chat ${m.conversationId}: no participant row for sender ${senderId}`,
    );
  }
}
