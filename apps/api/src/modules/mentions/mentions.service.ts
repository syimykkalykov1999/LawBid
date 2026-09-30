import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BlocksService } from '../blocks/blocks.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { MentionDto } from './mention.dto';
import { extractMentions } from './mentions';

/**
 * OQ-042 (owner 2026-09-30): "@username" in a post or a comment links to
 * the person and notifies them once (a `mention` notification). Attorneys
 * and clients share one username namespace. Nobody is notified about
 * their own mention, by someone they blocked or who blocked them, or
 * twice for the same text (an edit notifies only newly added people).
 */
@Injectable()
export class MentionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blocks: BlocksService,
    private readonly notifications: NotificationsService,
  ) {}

  /** handle → person, for the handles in [texts] (one query pair). */
  async resolve(texts: string[]): Promise<Map<string, MentionDto>> {
    const handles = [...new Set(texts.flatMap(extractMentions))];
    const out = new Map<string, MentionDto>();
    if (handles.length === 0) return out;
    const [attorneys, clients] = await Promise.all([
      this.prisma.attorneyProfile.findMany({
        where: {
          username_lower: { in: handles },
          user: { deleted_at: null },
        },
        select: { user_id: true, username_lower: true },
      }),
      this.prisma.clientProfile.findMany({
        where: {
          username_lower: { in: handles },
          user: { deleted_at: null },
        },
        select: { user_id: true, username_lower: true },
      }),
    ]);
    for (const a of attorneys) {
      out.set(a.username_lower, {
        username: a.username_lower,
        userId: a.user_id,
        kind: 'attorney',
      });
    }
    for (const c of clients) {
      if (!c.username_lower) continue;
      out.set(c.username_lower, {
        username: c.username_lower,
        userId: c.user_id,
        kind: 'client',
      });
    }
    return out;
  }

  /** The people mentioned in [text], in text order. */
  async of(text: string): Promise<MentionDto[]> {
    const map = await this.resolve([text]);
    return extractMentions(text).flatMap((h) => {
      const m = map.get(h);
      return m ? [m] : [];
    });
  }

  /** The mentions of one text among a batch resolved with [resolve]. */
  pick(text: string, map: Map<string, MentionDto>): MentionDto[] {
    return extractMentions(text).flatMap((h) => {
      const m = map.get(h);
      return m ? [m] : [];
    });
  }

  /**
   * Notifies the people newly mentioned in [text] (compared with
   * [previousText] on an edit). [skip]: people already told about this
   * content another way (e.g. the post author gets `post_comment`).
   */
  async notify(input: {
    actorId: string;
    text: string;
    previousText?: string;
    postId: string;
    commentId?: string;
    skip?: string[];
  }): Promise<number> {
    const before = new Set(
      input.previousText ? extractMentions(input.previousText) : [],
    );
    const fresh = extractMentions(input.text).filter((h) => !before.has(h));
    if (fresh.length === 0) return 0;
    const people = await this.resolve([fresh.map((h) => `@${h}`).join(' ')]);
    const skip = new Set([input.actorId, ...(input.skip ?? [])]);
    let sent = 0;
    for (const m of people.values()) {
      if (skip.has(m.userId)) continue;
      skip.add(m.userId);
      if (await this.blocks.isBlockedEitherWay(input.actorId, m.userId)) {
        continue;
      }
      await this.notifications.emit({
        type: 'mention',
        recipientId: m.userId,
        payload: {
          postId: input.postId,
          ...(input.commentId ? { commentId: input.commentId } : {}),
          actorId: input.actorId,
        },
      });
      sent++;
    }
    return sent;
  }
}
