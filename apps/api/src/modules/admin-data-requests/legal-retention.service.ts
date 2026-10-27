import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
// The one hold check shared by every purge job (privacy round 13, S13-6).
import { heldSql as held } from '../../common/privacy/legal-hold';
import { PrismaService } from '../../prisma/prisma.service';

const DAY_MS = 24 * 3600 * 1000;
/** Rows per UPDATE: small transactions, no long locks. */
const BATCH = 2000;
/** Batches per table per run; the next night continues. */
const MAX_BATCHES = 50;

export interface LegalRetentionResult {
  messages: number;
  messageEdits: number;
  groupMessages: number;
  channelPosts: number;
  posts: number;
  stories: number;
  questions: number;
  answers: number;
}

/**
 * Owner 2026-10-20: what a person deleted stays in the database for
 * `legal.deleted_retention_days` (90) so an official request can still reach
 * it; then this nightly job scrubs the text and keeps the row (counters,
 * replies and foreign keys stay intact). A legal hold on the person, chat
 * or group stops it. Only rows already deleted and past the cut-off are
 * touched, through the `deleted_at` / `revoked_at` indexes — never a table
 * scan of live content. 0 days = keep forever.
 */
@Injectable()
export class LegalRetentionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LegalRetentionService.name);
  }

  async run(now: Date = new Date()): Promise<LegalRetentionResult | null> {
    const days = await this.settings.number('legal.deleted_retention_days');
    if (days <= 0) return null;
    const cut = new Date(now.getTime() - days * DAY_MS);
    const result: LegalRetentionResult = {
      messages: await this.batched(
        // BUG-1 (package N-12b): the scrubbed messages' search tokens go
        // in the same statement (a moderation-hidden message kept them, so
        // a restore stays searchable until this point).
        (limit) => this.prisma.$executeRaw`
          WITH picked AS (
            SELECT m.id, m.conversation_id FROM messages m
            JOIN conversations c ON c.id = m.conversation_id
            WHERE (m.deleted_at < ${cut} OR m.revoked_at < ${cut})
              AND (m.body_original <> '' OR m.body_display <> '')
              AND NOT ${held('conversation', Prisma.sql`m.conversation_id`)}
              AND (c.case_id IS NULL OR NOT ${held('case', Prisma.sql`c.case_id`)})
              AND (m.file_id IS NULL OR NOT ${held('file', Prisma.sql`m.file_id`)})
              AND NOT ${held('user', Prisma.sql`c.client_id`)}
              AND NOT ${held('user', Prisma.sql`c.attorney_id`)}
              AND (m.sender_id IS NULL OR NOT ${held('user', Prisma.sql`m.sender_id`)})
            LIMIT ${limit}),
          tokens AS (
            DELETE FROM message_search_tokens st
            WHERE st.message_id IN (SELECT id FROM picked))
          UPDATE messages SET body_original = '', body_display = '', file_name = NULL
          WHERE (id, conversation_id) IN (
            SELECT id, conversation_id FROM picked)`,
      ),
      messageEdits: await this.batched(
        (limit) => this.prisma.$executeRaw`
          UPDATE message_edits SET body_original = ''
          WHERE id IN (
            SELECT e.id FROM message_edits e
            JOIN messages m ON m.id = e.message_id
                           AND m.conversation_id = e.conversation_id
            JOIN conversations c ON c.id = m.conversation_id
            WHERE (m.deleted_at < ${cut} OR m.revoked_at < ${cut})
              AND e.body_original <> ''
              AND (c.case_id IS NULL OR NOT ${held('case', Prisma.sql`c.case_id`)})
              AND NOT ${held('conversation', Prisma.sql`m.conversation_id`)}
              AND NOT ${held('user', Prisma.sql`c.client_id`)}
              AND NOT ${held('user', Prisma.sql`c.attorney_id`)}
              AND (m.sender_id IS NULL OR NOT ${held('user', Prisma.sql`m.sender_id`)})
            LIMIT ${limit})`,
      ),
      groupMessages: await this.batched(
        (limit) => this.prisma.$executeRaw`
          UPDATE chat_group_messages SET body = '', file_name = NULL
          WHERE (id, group_id) IN (
            SELECT m.id, m.group_id FROM chat_group_messages m
            WHERE m.deleted_at < ${cut} AND m.body <> ''
              AND NOT ${held('group', Prisma.sql`m.group_id`)}
              AND (m.sender_id IS NULL OR NOT ${held('user', Prisma.sql`m.sender_id`)})
            LIMIT ${limit})`,
      ),
      channelPosts: await this.batched(
        (limit) => this.prisma.$executeRaw`
          UPDATE channel_posts SET body = ''
          WHERE id IN (
            SELECT p.id FROM channel_posts p
            WHERE p.deleted_at < ${cut} AND p.body <> ''
              AND NOT ${held('user', Prisma.sql`p.author_id`)}
            LIMIT ${limit})`,
      ),
      posts: await this.batched(
        (limit) => this.prisma.$executeRaw`
          UPDATE posts SET body = '', title = NULL
          WHERE id IN (
            SELECT p.id FROM posts p
            WHERE p.deleted_at < ${cut} AND (p.body <> '' OR p.title IS NOT NULL)
              AND NOT ${held('user', Prisma.sql`p.author_id`)}
            LIMIT ${limit})`,
      ),
      stories: await this.batched(
        (limit) => this.prisma.$executeRaw`
          UPDATE stories SET text = CASE WHEN kind = 'text' THEN '' ELSE NULL END
          WHERE id IN (
            SELECT s.id FROM stories s
            WHERE s.deleted_at < ${cut} AND s.text IS NOT NULL AND s.text <> ''
              AND NOT ${held('user', Prisma.sql`s.author_id`)}
            LIMIT ${limit})`,
      ),
      // The text CHECK on questions/answers needs a minimum length, so the
      // scrubbed rows carry a fixed marker instead of an empty string.
      questions: await this.batched(
        (limit) => this.prisma.$executeRaw`
          UPDATE legal_questions SET title = '[removed]', body = '[removed after the retention period]'
          WHERE id IN (
            SELECT q.id FROM legal_questions q
            WHERE q.deleted_at < ${cut} AND q.title <> '[removed]'
              AND NOT ${held('user', Prisma.sql`q.author_id`)}
            LIMIT ${limit})`,
      ),
      answers: await this.batched(
        (limit) => this.prisma.$executeRaw`
          UPDATE legal_answers SET body = '[removed after the retention period]'
          WHERE id IN (
            SELECT a.id FROM legal_answers a
            WHERE a.deleted_at < ${cut} AND a.body <> '[removed after the retention period]'
              AND NOT ${held('user', Prisma.sql`a.attorney_id`)}
            LIMIT ${limit})`,
      ),
    };
    this.logger.info(result, 'legal retention scrub done');
    return result;
  }

  private async batched(
    step: (limit: number) => Promise<number>,
  ): Promise<number> {
    let total = 0;
    for (let i = 0; i < MAX_BATCHES; i += 1) {
      const n = await step(BATCH);
      total += n;
      if (n < BATCH) break;
    }
    return total;
  }
}
