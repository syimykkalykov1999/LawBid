import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';
import { forEachDatabase } from '../../sharding/for-each-database';
import { FileReleaseService } from '../files/storage/file-release.service';

/** Rows per statement: small transactions, no long locks. */
const BATCH = 1000;
/** Batches per table per run; the next minute continues. */
const MAX_BATCHES = 20;

export interface DisappearingSweepResult {
  messages: number;
  groupMessages: number;
  files: number;
}

interface Expired {
  id: string;
  /** conversation_id / group_id */
  chat_id: string;
  file_id: string | null;
}

/**
 * Owner 2026-10-21 (WhatsApp «Disappearing messages»): every minute, the
 * messages whose `expires_at` has passed are marked deleted (`deleted_at`) —
 * exactly what a person's own delete does — so every list, unread count and
 * search already ignores them, and the nightly legal retention scrubs their
 * text 90 days later (a hold on the chat, group or person still stops it).
 * The attached file / voice note goes from storage with them (a shared
 * object stays while another live row uses it). Chat and group rows whose
 * preview pointed at an expired message are moved to the newest remaining one.
 *
 * Reads only through the partial indexes `messages_expiry_idx` and
 * `chat_group_messages_expiry_idx` (rows still waiting to expire), in
 * batches with SKIP LOCKED, so two workers never fight and the cost is
 * proportional to what expired, not to the table.
 */
@Injectable()
export class DisappearingSweepService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly releases: FileReleaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(DisappearingSweepService.name);
  }

  async run(now: Date = new Date()): Promise<DisappearingSweepResult> {
    // Shard-ready step 8: the raw SQL runs on each physical database in turn.
    const per = await forEachDatabase(this.prisma, async () => ({
      messages: await this.drain((limit) => this.expireMessages(now, limit)),
      groupMessages: await this.drain((limit) =>
        this.expireGroupMessages(now, limit),
      ),
    }));
    const messages = {
      count: per.reduce((n, r) => n + r.messages.count, 0),
      files: per.flatMap((r) => r.messages.files),
    };
    const groupMessages = {
      count: per.reduce((n, r) => n + r.groupMessages.count, 0),
      files: per.flatMap((r) => r.groupMessages.files),
    };
    const fileIds = [...messages.files, ...groupMessages.files];
    const released = fileIds.length
      ? await this.releases.release(fileIds, 'disappeared', now)
      : { released: 0 };
    const result = {
      messages: messages.count,
      groupMessages: groupMessages.count,
      files: released.released,
    };
    if (result.messages + result.groupMessages > 0) {
      this.logger.info(result, 'disappearing messages swept');
    }
    return result;
  }

  private async drain(
    step: (limit: number) => Promise<{ count: number; files: string[] }>,
  ): Promise<{ count: number; files: string[] }> {
    let count = 0;
    const files: string[] = [];
    for (let i = 0; i < MAX_BATCHES; i += 1) {
      const r = await step(BATCH);
      count += r.count;
      files.push(...r.files);
      if (r.count < BATCH) break;
    }
    return { count, files };
  }

  private async expireMessages(now: Date, limit: number) {
    const rows = await this.prisma.$queryRaw<Expired[]>`
      WITH due AS (
        SELECT id, conversation_id FROM messages
        WHERE expires_at <= ${now} AND deleted_at IS NULL
        ORDER BY expires_at
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED)
      UPDATE messages m SET deleted_at = ${now}
      FROM due WHERE m.id = due.id AND m.conversation_id = due.conversation_id
      RETURNING m.id::TEXT AS id, m.conversation_id::TEXT AS chat_id,
                m.file_id::TEXT AS file_id`;
    if (rows.length === 0) return { count: 0, files: [] };
    const ids = rows.map((r) => r.id);
    await this.prisma.$transaction([
      this.prisma.messagePin.deleteMany({ where: { message_id: { in: ids } } }),
      this.prisma.messageReaction.deleteMany({
        where: { message_id: { in: ids } },
      }),
    ]);
    await this.prisma.$executeRaw`
      UPDATE conversations c SET last_message_id = (
        SELECT m.id FROM messages m
        WHERE m.conversation_id = c.id AND m.deleted_at IS NULL
        ORDER BY m.created_at DESC, m.id DESC LIMIT 1)
      WHERE c.id = ANY(${[...new Set(rows.map((r) => r.chat_id))]}::UUID[])
        AND c.last_message_id = ANY(${ids}::UUID[])`;
    return { count: rows.length, files: fileIdsOf(rows) };
  }

  private async expireGroupMessages(now: Date, limit: number) {
    const rows = await this.prisma.$queryRaw<Expired[]>`
      WITH due AS (
        SELECT id, group_id FROM chat_group_messages
        WHERE expires_at <= ${now} AND deleted_at IS NULL
        ORDER BY expires_at
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED)
      UPDATE chat_group_messages m SET deleted_at = ${now}, mention_ids = '{}'
      FROM due WHERE m.id = due.id AND m.group_id = due.group_id
      RETURNING m.id::TEXT AS id, m.group_id::TEXT AS chat_id,
                m.file_id::TEXT AS file_id`;
    if (rows.length === 0) return { count: 0, files: [] };
    const ids = rows.map((r) => r.id);
    const groups = [...new Set(rows.map((r) => r.chat_id))];
    await this.prisma.$executeRaw`
      UPDATE chat_groups g SET
        last_message_id = CASE WHEN g.last_message_id = ANY(${ids}::UUID[]) THEN (
          SELECT m.id FROM chat_group_messages m
          WHERE m.group_id = g.id AND m.deleted_at IS NULL
          ORDER BY m.created_at DESC, m.id DESC LIMIT 1) ELSE g.last_message_id END,
        pinned_message_id = CASE WHEN g.pinned_message_id = ANY(${ids}::UUID[])
                                 THEN NULL ELSE g.pinned_message_id END
      WHERE g.id = ANY(${groups}::UUID[])
        AND (g.last_message_id = ANY(${ids}::UUID[])
             OR g.pinned_message_id = ANY(${ids}::UUID[]))`;
    await this.prisma.$executeRaw`
      UPDATE chat_group_topics t SET last_message_id = (
        SELECT m.id FROM chat_group_messages m
        WHERE m.topic_id = t.id AND m.deleted_at IS NULL
        ORDER BY m.created_at DESC, m.id DESC LIMIT 1)
      WHERE t.group_id = ANY(${groups}::UUID[])
        AND t.last_message_id = ANY(${ids}::UUID[])`;
    return { count: rows.length, files: fileIdsOf(rows) };
  }
}

function fileIdsOf(rows: Expired[]): string[] {
  return rows.flatMap((r) => (r.file_id ? [r.file_id] : []));
}
