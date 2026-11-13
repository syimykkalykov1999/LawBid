import type { Prisma } from '@prisma/client';

/** What the chat row says at the moment a message got its number. */
export interface ChatSendSlot {
  /** The message's per-chat number (migration 20261109090000_message_seq). */
  seq: number;
  contacts_unlocked: boolean;
  disappear_after_s: number | null;
  shard_id: number;
}

/**
 * Row 82 (load test 2026-11-13): the ONE statement of a send that takes the
 * chat row lock. It numbers the message (`last_seq + 1`), moves the chat's
 * "last message", brings a removed chat back for both sides and marks the
 * sender's own message read — and returns what the locked row says (closed,
 * contacts unlocked, disappearing timer, shard) for the checks that need it.
 *
 * The send used to open with `SELECT … FOR UPDATE` on the chat and keep the
 * lock across 4–5 round trips (insert, its seq trigger, search tokens, this
 * bookkeeping, commit); at 2 000 req/s senders of a busy chat queued 0.5–1.3 s
 * on that lock and the pool ran dry (503). Now everything that does not need
 * the lock runs first, this statement comes LAST before the message insert
 * and the commit: the lock is held for the insert and the commit only. Same
 * pattern as Mattermost (`UPDATE Channels SET TotalMsgCount = TotalMsgCount +
 * …` in post_store.go) and Rocket.Chat (`$inc: { msgs: 1 }`): an atomic
 * increment in the database, never read-then-lock; numbers stay gapless and
 * ordered because the lock is held until commit (a rolled-back send rolls
 * its number back).
 *
 * An UPDATE of non-key columns takes FOR NO KEY UPDATE, which does not
 * conflict with the KEY SHARE that inserts referencing the chat take (KE 121).
 * In READ COMMITTED a concurrent close is waited for and re-checked, so a
 * closed chat returns null. The insert is given `seq`, so the trigger
 * `messages_assign_seq` (which still numbers every other write path) skips it.
 *
 * Times: `last_message_at` is `now()` (transaction start), the very value
 * the insert's `created_at` default takes in the same transaction; read
 * markers use `clock_timestamp()` as before.
 *
 * Throws when the sender has no participant row (the send is rolled back, as
 * the Prisma `update` the bookkeeping replaced did, P2025).
 */
export async function claimChatSendSlot(
  tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
  m: { conversationId: string; messageId: string },
  senderId: string,
): Promise<ChatSendSlot | null> {
  const rows = await tx.$queryRaw<(ChatSendSlot & { touched: number })[]>`
    WITH c AS (
      UPDATE conversations
         SET last_seq = last_seq + 1,
             last_message_at = now(),
             last_message_id = ${m.messageId}::uuid,
             updated_at = clock_timestamp()
       WHERE id = ${m.conversationId}::uuid
         AND status <> 'closed'
      RETURNING last_seq, contacts_unlocked, disappear_after_s, shard_id
    ), p AS (
      UPDATE conversation_participants
         SET hidden_at = NULL,
             last_read_message_id = CASE WHEN user_id = ${senderId}::uuid
                                         THEN ${m.messageId}::uuid
                                         ELSE last_read_message_id END,
             last_read_at = CASE WHEN user_id = ${senderId}::uuid
                                 THEN clock_timestamp() ELSE last_read_at END,
             updated_at = clock_timestamp()
       WHERE conversation_id = ${m.conversationId}::uuid
         AND (hidden_at IS NOT NULL OR user_id = ${senderId}::uuid)
         AND EXISTS (SELECT 1 FROM c)
      RETURNING (user_id = ${senderId}::uuid) AS mine
    )
    SELECT c.last_seq AS seq, c.contacts_unlocked,
           c.disappear_after_s, c.shard_id,
           (SELECT count(*) FROM p WHERE p.mine)::int AS touched
      FROM c`;
  const row = rows[0];
  if (!row) return null;
  // The sender's own row is always among the updated ones.
  if (row.touched === 0) {
    throw new Error(
      `chat ${m.conversationId}: no participant row for sender ${senderId}`,
    );
  }
  return {
    seq: row.seq,
    contacts_unlocked: row.contacts_unlocked,
    disappear_after_s: row.disappear_after_s,
    shard_id: row.shard_id,
  };
}
