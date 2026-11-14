import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { forEachDatabase } from '../../sharding/for-each-database';
import { readsAreSplit } from '../../sharding/split-reads';

export const REPLY_TIME_BATCH = 500;

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

export interface ReplyTimeResult {
  scanned: number;
  changed: number;
}

/** The median of [values] (the mean of the middle two for an even count),
 * rounded to whole minutes; null for an empty list. */
export function medianMinutes(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const m =
    sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return Math.round(m);
}

/**
 * Owner row 112 (Airbnb «Typically responds within an hour», Upwork «Avg
 * response time», Thumbtack «Responds in about …»): the attorney profile
 * shows how fast the attorney usually answers. A profile open never runs
 * this — the nightly job writes `attorney_profiles.reply_minutes_median`
 * (owner rule: numbers from a snapshot, no live heavy queries).
 *
 * For every attorney-client chat with activity in the last
 * `profile.reply_time_window_days`: the client's first message in that
 * window, and the attorney's first message after it (sent by the attorney
 * or an assistant in the attorney's name). The median of those gaps over
 * the attorney's answered chats; fewer than `profile.reply_time_min_chats`
 * answered chats (or the switch `profile.reply_time_enabled` off) = null.
 *
 * Walks attorney_profiles by primary key in batches; the chats are read on
 * every database (shard-ready: conversations live with their case), the
 * profiles are written on the global side, and only rows whose value
 * changed are touched (their `updated_at` moves, so the cached public
 * profile refreshes). Uses `messages_conv_sender_created_idx` and
 * `conversations (attorney_id, last_message_at)`. Idempotent.
 */
@Injectable()
export class AttorneyReplyTimeJob {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AttorneyReplyTimeJob.name);
  }

  async run(batchSize: number = REPLY_TIME_BATCH): Promise<ReplyTimeResult> {
    const [enabled, windowDays, minChats] = await Promise.all([
      this.settings.boolean('profile.reply_time_enabled'),
      this.settings.number('profile.reply_time_window_days'),
      this.settings.number('profile.reply_time_min_chats'),
    ]);
    const global = readsAreSplit(this.prisma)
      ? this.prisma.global()
      : this.prisma;
    let cursor = ZERO_UUID;
    let scanned = 0;
    let changed = 0;
    for (;;) {
      const batch = await global.$queryRaw<{ user_id: string }[]>`
        SELECT user_id::TEXT AS user_id
        FROM attorney_profiles
        WHERE user_id > ${cursor}::UUID
        ORDER BY user_id
        LIMIT ${batchSize}`;
      if (batch.length === 0) break;
      const ids = batch.map((b) => b.user_id);
      const gaps = enabled
        ? await this.gapsOf(ids, Math.max(1, windowDays))
        : new Map<string, number[]>();
      const medians = ids.map((id) => {
        const list = gaps.get(id) ?? [];
        return list.length >= Math.max(1, minChats)
          ? medianMinutes(list)
          : null;
      });
      changed += await global.$executeRaw`
        UPDATE attorney_profiles AS ap
        SET reply_minutes_median = t.m, reply_stats_at = now(),
            updated_at = now()
        FROM unnest(${ids}::UUID[], ${medians}::INT4[]) AS t(id, m)
        WHERE ap.user_id = t.id
          AND ap.reply_minutes_median IS DISTINCT FROM t.m`;
      scanned += ids.length;
      if (batch.length < batchSize) break;
      cursor = ids[ids.length - 1];
    }
    this.logger.info({ scanned, changed, enabled }, 'attorney reply times');
    return { scanned, changed };
  }

  /** Reply gaps in minutes per attorney, from every database. */
  private async gapsOf(
    ids: string[],
    windowDays: number,
  ): Promise<Map<string, number[]>> {
    const parts = await forEachDatabase(
      this.prisma,
      () =>
        this.prisma.$queryRaw<{ attorney_id: string; gaps: number[] }[]>`
          SELECT c.attorney_id::TEXT AS attorney_id,
                 array_agg(
                   greatest(0, round(extract(epoch FROM (r.replied - q.asked)) / 60))::INT4
                 ) AS gaps
          FROM conversations AS c
          CROSS JOIN LATERAL (
            SELECT min(m.created_at) AS asked
            FROM messages AS m
            WHERE m.conversation_id = c.id
              AND m.sender_id = c.client_id
              AND m.deleted_at IS NULL
              AND m.created_at >= now() - make_interval(days => ${windowDays}::INT4)
          ) AS q
          CROSS JOIN LATERAL (
            SELECT min(m.created_at) AS replied
            FROM messages AS m
            WHERE m.conversation_id = c.id
              AND m.sender_id = c.attorney_id
              AND m.deleted_at IS NULL
              AND m.created_at > q.asked
          ) AS r
          WHERE c.attorney_id = ANY(${ids}::UUID[])
            AND c.pair_kind = 'attorney_client'
            AND c.last_message_at >= now() - make_interval(days => ${windowDays}::INT4)
            AND q.asked IS NOT NULL
            AND r.replied IS NOT NULL
          GROUP BY c.attorney_id`,
    );
    const out = new Map<string, number[]>();
    for (const row of parts.flat()) {
      const list = out.get(row.attorney_id) ?? [];
      for (const g of row.gaps) list.push(Number(g));
      out.set(row.attorney_id, list);
    }
    return out;
  }
}
