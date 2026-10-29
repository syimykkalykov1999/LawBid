import type { PrismaService } from '../../prisma/prisma.service';

/** What a page of messages needs besides the rows themselves (owner
 * 2026-10-20): reactions, the quoted message of each reply, pins. Fetched
 * for the whole page in three queries; per-viewer parts (`mine`) are
 * derived in ChatService.toMessage. */
export interface MessageExtras {
  reactions: Map<string, { emoji: string; userId: string }[]>;
  replyTargets: Map<
    string,
    {
      id: string;
      sender_id: string | null;
      type: string;
      body_display: string;
      revoked_at: Date | null;
    }
  >;
  pinned: Set<string>;
}

export async function loadMessageExtras(
  prisma: PrismaService,
  rows: { id: string; conversation_id: string; reply_to_id: string | null }[],
  /** Load test round 2: rows inserted by this very request (a message just
   * sent) can carry no reactions or pins yet — nobody has seen their id —
   * so those two lookups are skipped; the quoted message is still read. */
  opts: { fresh?: boolean } = {},
): Promise<MessageExtras> {
  const ids = rows.map((r) => r.id);
  const replyIds = [
    ...new Set(rows.flatMap((r) => (r.reply_to_id ? [r.reply_to_id] : []))),
  ];
  // A reply always quotes a message of its own chat: naming the chats lets
  // PostgreSQL read only their hash partitions of `messages`.
  const replyChats = [
    ...new Set(rows.filter((r) => r.reply_to_id).map((r) => r.conversation_id)),
  ];
  if (ids.length === 0) {
    return { reactions: new Map(), replyTargets: new Map(), pinned: new Set() };
  }
  const [reactions, targets, pins] = await Promise.all([
    opts.fresh
      ? Promise.resolve([])
      : prisma.messageReaction.findMany({
          where: { message_id: { in: ids } },
          select: { message_id: true, user_id: true, emoji: true },
          orderBy: { created_at: 'asc' },
        }),
    replyIds.length
      ? prisma.message.findMany({
          where: {
            id: { in: replyIds },
            conversation_id: { in: replyChats },
          },
          select: {
            id: true,
            sender_id: true,
            type: true,
            body_display: true,
            revoked_at: true,
          },
        })
      : Promise.resolve([]),
    opts.fresh
      ? Promise.resolve([])
      : prisma.messagePin.findMany({
          where: { message_id: { in: ids } },
          select: { message_id: true },
        }),
  ]);
  const byMessage = new Map<string, { emoji: string; userId: string }[]>();
  for (const r of reactions) {
    const list = byMessage.get(r.message_id) ?? [];
    list.push({ emoji: r.emoji, userId: r.user_id });
    byMessage.set(r.message_id, list);
  }
  return {
    reactions: byMessage,
    replyTargets: new Map(targets.map((t) => [t.id, t])),
    pinned: new Set(pins.map((p) => p.message_id)),
  };
}

/** One person, one emoji: "👍", "❤️", "😂" … A single grapheme made of
 * emoji code points (no letters or digits). */
export function isSingleEmoji(text: string): boolean {
  const t = text.trim();
  if (!t || [...t].length > 12) return false;
  const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  if ([...seg.segment(t)].length !== 1) return false;
  return /\p{Extended_Pictographic}|\p{Regional_Indicator}|^[#*0-9]️?⃣$/u.test(
    t,
  );
}
