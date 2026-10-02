import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { BadgesService } from '../notifications/badges.service';
import { RealtimePublisher } from '../realtime/realtime-publisher.service';

/** docs/05 §8.2 system messages; the app localizes `chat.system.<key>`. */
export type ChatSystemKey =
  'offer_accepted' | 'no_agreement' | 'case_closed' | 'accepted_by_other';

/** A conversation changed inside a transaction; published after commit. */
export interface ChatChange {
  conversationId: string;
  userIds: string[];
}

/**
 * Posts system messages from the file-04 transactions (bid accepted or
 * declined, case closed/archived/deleted) in the same transaction as the
 * change they announce, optionally closing the conversation (docs/04 §9:
 * pre-acceptance chats close when the case leaves `open`). The caller
 * passes the returned changes to publish() once the transaction commits.
 */
@Injectable()
export class ChatSystemMessages {
  constructor(
    private readonly realtime: RealtimePublisher,
    private readonly badges: BadgesService,
  ) {}

  async post(
    tx: Prisma.TransactionClient,
    where: Prisma.ConversationWhereInput,
    key: ChatSystemKey,
    opts: { close?: boolean } = {},
  ): Promise<ChatChange[]> {
    const conversations = await tx.conversation.findMany({
      where,
      select: { id: true, client_id: true, attorney_id: true },
    });
    const changes: ChatChange[] = [];
    for (const c of conversations) {
      const m = await tx.message.create({
        data: {
          conversation_id: c.id,
          sender_id: null,
          type: 'system',
          body_original: key,
          body_display: key,
          client_message_id: `system:${key}:${randomUUID()}`,
        },
        select: { id: true, created_at: true },
      });
      await tx.conversation.update({
        where: { id: c.id },
        data: {
          last_message_at: m.created_at,
          last_message_id: m.id,
          ...(opts.close ? { status: 'closed' } : {}),
        },
      });
      changes.push({
        conversationId: c.id,
        userIds: [c.client_id, c.attorney_id],
      });
    }
    return changes;
  }

  publish(changes: ChatChange[]): void {
    for (const c of changes) {
      this.realtime.toUsers(c.userIds, 'conversation:update', {
        conversationId: c.conversationId,
      });
      // A system line is unread for both sides: recount their chat badges
      // (it used to drift until the next recount).
      for (const uid of c.userIds) {
        void this.badges.chatsChanged(uid).catch(() => undefined);
      }
    }
  }
}
