import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { OPS_KEYS, parseJson } from '../../common/ops/ops.constants';
import { MessageBodyCipher } from '../../common/secrets/message-body-cipher';
import {
  MessageSearchIndex,
  SEARCHABLE_MESSAGE_TYPES,
  type SearchTokenRow,
} from '../../common/secrets/message-search-index';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';

/** Default messages per batch (setting `chat.search.backfill_batch`). */
export const CHAT_SEARCH_BACKFILL_BATCH = 500;
/** Breath between batches, so a busy chat never feels the job. */
export const CHAT_SEARCH_BACKFILL_PAUSE_MS = 150;
/** «Авто» works in this UTC window (night in the US, ~1–7 am ET). */
export const CHAT_SEARCH_BACKFILL_NIGHT_UTC = { from: 6, to: 12 } as const;

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

export type ChatSearchBackfillMode = 'off' | 'on' | 'auto';

/** Progress of one pass over `messages`, kept in Redis (resumable). */
export interface ChatSearchBackfillState {
  /** Which SEARCH_INDEX_KEY the pass is for (MessageSearchIndex.fingerprint). */
  fingerprint: string;
  /** Keyset cursor: the last message id handled. */
  cursor: string;
  scanned: number;
  /** Messages whose tokens were (re)written. */
  indexed: number;
  /** Bodies that did not open (counted, never logged with text). */
  failed: number;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

export type ChatSearchBackfillResult =
  | { skipped: 'disabled' | 'mode_off' | 'not_night' | 'done' }
  | { scanned: number; indexed: number; failed: number; done: boolean };

interface Row {
  id: string;
  conversation_id: string;
  type: string;
  body_display: string;
  edited_at: Date | null;
  revoked_at: Date | null;
  deleted_at: Date | null;
}

/**
 * BUG-1 (2026-10-25, package N-12b): the messages written before the blind
 * search index existed (or under an older SEARCH_INDEX_KEY) get their
 * tokens here. Walks `messages` by primary key (keyset, resumable: the
 * cursor lives in Redis), opens each sealed body in the worker, and in one
 * short transaction per batch replaces the batch's tokens — idempotent, so
 * a crash or a repeat costs nothing. A row edited / deleted between the read
 * and the write is skipped (its own request already wrote the right tokens).
 *
 * Control (admin, «Система → Настройки»): `chat.search.backfill_mode`
 * off | on | auto (default: only at night UTC 06–12, and once the pass is
 * finished it idles — one Redis read per tick), ceiling
 * `chat.search.backfill_rows_per_run`, batch `chat.search.backfill_batch`,
 * and the «Пауза тяжёлых задач»
 * switch (it is in HEAVY_CRON_JOBS). A changed key restarts the pass.
 */
@Injectable()
export class ChatSearchBackfillJob {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly index: MessageSearchIndex,
    private readonly cipher: MessageBodyCipher,
    private readonly settings: AppSettingsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ChatSearchBackfillJob.name);
  }

  async state(): Promise<ChatSearchBackfillState | null> {
    const raw = await this.redis.get(OPS_KEYS.chatSearchBackfill);
    return parseJson<ChatSearchBackfillState>(raw);
  }

  /** Forget the progress: the next tick starts a new pass. */
  async restart(): Promise<void> {
    await this.redis.del(OPS_KEYS.chatSearchBackfill);
  }

  private async mode(): Promise<ChatSearchBackfillMode> {
    const v = await this.settings.string('chat.search.backfill_mode');
    return v === 'off' || v === 'on' ? v : 'auto';
  }

  static isNight(now: Date): boolean {
    const h = now.getUTCHours();
    return (
      h >= CHAT_SEARCH_BACKFILL_NIGHT_UTC.from &&
      h < CHAT_SEARCH_BACKFILL_NIGHT_UTC.to
    );
  }

  async run(
    now: Date = new Date(),
    sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((r) => setTimeout(r, ms)),
  ): Promise<ChatSearchBackfillResult> {
    const fingerprint = this.index.fingerprint();
    if (!this.index.enabled || !fingerprint) return { skipped: 'disabled' };
    const mode = await this.mode();
    if (mode === 'off') return { skipped: 'mode_off' };
    let state = await this.state();
    if (!state || state.fingerprint !== fingerprint) {
      state = {
        fingerprint,
        cursor: ZERO_UUID,
        scanned: 0,
        indexed: 0,
        failed: 0,
        startedAt: now.toISOString(),
        updatedAt: now.toISOString(),
        finishedAt: null,
      };
    } else if (state.finishedAt) {
      return { skipped: 'done' };
    }
    if (mode === 'auto' && !ChatSearchBackfillJob.isNight(now)) {
      return { skipped: 'not_night' };
    }
    const batchSize = await this.batchSize();
    const ceiling = Math.max(
      batchSize,
      await this.settings.number('chat.search.backfill_rows_per_run'),
    );
    const prefixes = await this.index.prefixMode();
    const before = { ...state };
    let done = false;
    for (let read = 0; read < ceiling; read += batchSize) {
      const more = await this.batch(state, prefixes, batchSize);
      state.updatedAt = new Date().toISOString();
      if (!more) {
        done = true;
        state.finishedAt = state.updatedAt;
      }
      await this.redis.set(OPS_KEYS.chatSearchBackfill, JSON.stringify(state));
      if (done) break;
      await sleep(CHAT_SEARCH_BACKFILL_PAUSE_MS);
    }
    const result = {
      scanned: state.scanned - before.scanned,
      indexed: state.indexed - before.indexed,
      failed: state.failed - before.failed,
      done,
    };
    this.logger.info(result, 'chat search backfill');
    return result;
  }

  /** `chat.search.backfill_batch`, clamped to 50..5000 (default 500). */
  private async batchSize(): Promise<number> {
    let v = CHAT_SEARCH_BACKFILL_BATCH;
    try {
      v = await this.settings.number('chat.search.backfill_batch');
    } catch {
      v = CHAT_SEARCH_BACKFILL_BATCH;
    }
    if (!Number.isFinite(v) || v <= 0) v = CHAT_SEARCH_BACKFILL_BATCH;
    return Math.min(5000, Math.max(50, Math.floor(v)));
  }

  /** One batch; false when the table is exhausted. */
  private async batch(
    state: ChatSearchBackfillState,
    prefixes: boolean,
    take: number,
  ): Promise<boolean> {
    const rows: Row[] = await this.prisma.message.findMany({
      where: { id: { gt: state.cursor } },
      select: {
        id: true,
        conversation_id: true,
        type: true,
        body_display: true,
        edited_at: true,
        revoked_at: true,
        deleted_at: true,
      },
      orderBy: { id: 'asc' },
      take,
    });
    if (rows.length === 0) return false;
    const live = rows.filter(
      (r) =>
        SEARCHABLE_MESSAGE_TYPES.includes(r.type) &&
        !r.revoked_at &&
        !r.deleted_at,
    );
    const tokens: SearchTokenRow[] = [];
    const indexed: Row[] = [];
    for (const r of live) {
      const text = MessageBodyCipher.isSealed(r.body_display)
        ? this.cipher.open(r.body_display, r.id)
        : r.body_display;
      if (text === '' && r.body_display !== '') {
        state.failed += 1;
        continue;
      }
      indexed.push(r);
      tokens.push(...this.index.rowsFor(r, text, prefixes));
    }
    if (indexed.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        // A row changed since the read keeps what its own request wrote.
        // FOR SHARE: an edit / delete-for-all updates the message row
        // before its tokens, so it waits for this transaction (or this one
        // sees its new edited_at / revoked_at and skips the row).
        const now = await tx.$queryRaw<
          Pick<Row, 'id' | 'edited_at' | 'revoked_at' | 'deleted_at'>[]
        >`SELECT id::TEXT AS id, edited_at, revoked_at, deleted_at
            FROM messages WHERE id = ANY(${indexed.map((r) => r.id)}::UUID[])
            FOR SHARE`;
        const same = new Set(
          now
            .filter((n) => {
              const r = indexed.find((x) => x.id === n.id)!;
              return (
                +(n.edited_at ?? 0) === +(r.edited_at ?? 0) &&
                !n.revoked_at &&
                !n.deleted_at
              );
            })
            .map((n) => n.id),
        );
        const ids = [...same];
        if (ids.length === 0) return;
        await tx.messageSearchToken.deleteMany({
          where: { message_id: { in: ids } },
        });
        const data = tokens.filter((t) => same.has(t.message_id));
        if (data.length > 0) {
          await tx.messageSearchToken.createMany({
            data,
            skipDuplicates: true,
          });
        }
        state.indexed += ids.length;
      });
    }
    state.scanned += rows.length;
    state.cursor = rows[rows.length - 1].id;
    return rows.length === take;
  }
}
