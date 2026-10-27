import { Prisma } from '@prisma/client';

/**
 * `FROM … WHERE …` of the messages [viewer] has not read in a group, for
 * use inside `SELECT count(*) FROM (SELECT 1 FROM <this> ORDER BY … LIMIT n)`.
 * The surrounding query must expose `gm` (chat_group_members, the viewer's
 * row) and `g` (chat_groups). A forum group keeps a read position per topic
 * (falling back to the group-wide one until a topic is first read); only
 * messages written after the viewer joined count.
 */
export function unreadMessagesSql(viewer: string): Prisma.Sql {
  return Prisma.sql`
    chat_group_messages m
    LEFT JOIN chat_group_topic_reads tr
      ON g.topics_enabled
     AND tr.user_id = ${viewer}::UUID
     AND tr.topic_id = COALESCE(m.topic_id, g.general_topic_id)
    LEFT JOIN chat_group_messages lr
      ON lr.group_id = g.id
     AND lr.id = CASE WHEN g.topics_enabled
                      THEN COALESCE(tr.last_read_message_id, gm.last_read_message_id)
                      ELSE gm.last_read_message_id END
    WHERE m.group_id = g.id
      AND m.deleted_at IS NULL
      AND m.type <> 'system'
      AND (m.sender_id IS NULL OR m.sender_id <> ${viewer}::UUID)
      AND m.created_at >= gm.joined_at
      AND (lr.id IS NULL OR (m.created_at, m.id) > (lr.created_at, lr.id))`;
}
