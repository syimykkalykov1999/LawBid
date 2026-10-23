import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { OPS_KEYS, parseJson } from '../../common/ops/ops.constants';
import { MessageBodyCipher } from '../../common/secrets/message-body-cipher';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';

/** Rows read per batch; a few batches per 5-minute tick. */
export const MESSAGE_REENCRYPT_BATCH = 500;
export const MESSAGE_REENCRYPT_BATCHES_PER_RUN = 8;
/** Breath between batches, so a busy chat never feels the job. */
export const MESSAGE_REENCRYPT_PAUSE_MS = 150;

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

export type ReencryptPhase = 'messages' | 'edits' | 'done';

/** Progress of one pass over both tables, kept in Redis (resumable). */
export interface MessageReencryptState {
  /** Identifies the key set the pass is for (kids + active kid, no secrets). */
  fingerprint: string;
  activeKid: string;
  phase: ReencryptPhase;
  /** Keyset cursor (last id handled) inside the current phase. */
  cursor: string;
  scanned: number;
  rewritten: number;
  /** Rows that could not be opened (counted, never logged with text). */
  failed: number;
  /** Per retired key id: columns rewritten away from it / still stuck under it. */
  byKid: Record<string, { rewritten: number; failed: number }>;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

export interface MessageReencryptResult {
  phase: ReencryptPhase;
  scanned: number;
  rewritten: number;
  failed: number;
}

export const MESSAGE_REENCRYPT_STATE_KEY = OPS_KEYS.messageReencrypt;

/**
 * Owner 2026-10-22 (docs/SECURITY_TODO.md «Re-encryption job»): walks
 * `messages` (body_original, body_display) and `message_edits`
 * (body_original, AAD = its message id) by primary key and rewrites every
 * `enc:v2…` row and every row under a retired key id as `enc:v3` with the
 * active key. Resumable (cursor in Redis), throttled (small batches with
 * a pause), counts failures without logging any text. A pass restarts on
 * its own when the key set changes (a new active kid); the admin
 * «Здоровье системы» tile shows the counters, and once a retired kid shows
 * zero stuck rows after a finished pass it can leave MESSAGE_ENC_KEYS.
 * Without keys (local dev) the job is a no-op.
 */
@Injectable()
export class MessageReencryptJob {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly cipher: MessageBodyCipher,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(MessageReencryptJob.name);
  }

  /** Current key set identity; changes when kids or the active kid change. */
  fingerprint(): string | null {
    const active = this.cipher.activeKid;
    if (!active) return null;
    return createHash('sha256')
      .update(`${active}|${this.cipher.kids.join(',')}`)
      .digest('hex')
      .slice(0, 16);
  }

  async state(): Promise<MessageReencryptState | null> {
    const raw = await this.redis.get(MESSAGE_REENCRYPT_STATE_KEY);
    return parseJson<MessageReencryptState>(raw);
  }

  /** Admin button: forget the progress, so the next tick starts a new pass. */
  async restart(): Promise<void> {
    await this.redis.del(MESSAGE_REENCRYPT_STATE_KEY);
  }

  async run(
    now: Date = new Date(),
    sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((r) => setTimeout(r, ms)),
  ): Promise<MessageReencryptResult | null> {
    const fingerprint = this.fingerprint();
    const activeKid = this.cipher.activeKid;
    if (!fingerprint || !activeKid) return null;
    let state = await this.state();
    if (!state || state.fingerprint !== fingerprint) {
      state = {
        fingerprint,
        activeKid,
        phase: 'messages',
        cursor: ZERO_UUID,
        scanned: 0,
        rewritten: 0,
        failed: 0,
        byKid: {},
        startedAt: now.toISOString(),
        updatedAt: now.toISOString(),
        finishedAt: null,
      };
    }
    if (state.phase === 'done') {
      return this.result(state);
    }
    for (let i = 0; i < MESSAGE_REENCRYPT_BATCHES_PER_RUN; i += 1) {
      const more =
        state.phase === 'messages'
          ? await this.messagesBatch(state)
          : await this.editsBatch(state);
      state.updatedAt = new Date().toISOString();
      if (!more) {
        if (state.phase === 'messages') {
          state.phase = 'edits';
          state.cursor = ZERO_UUID;
        } else {
          state.phase = 'done';
          state.finishedAt = new Date().toISOString();
        }
      }
      await this.save(state);
      if (state.phase === 'done') break;
      await sleep(MESSAGE_REENCRYPT_PAUSE_MS);
    }
    this.logger.info(
      {
        phase: state.phase,
        scanned: state.scanned,
        rewritten: state.rewritten,
        failed: state.failed,
      },
      'message re-encryption',
    );
    return this.result(state);
  }

  private result(s: MessageReencryptState): MessageReencryptResult {
    return {
      phase: s.phase,
      scanned: s.scanned,
      rewritten: s.rewritten,
      failed: s.failed,
    };
  }

  private async save(state: MessageReencryptState): Promise<void> {
    await this.redis.set(MESSAGE_REENCRYPT_STATE_KEY, JSON.stringify(state));
  }

  /** One batch of `messages`; false when the table is exhausted. */
  private async messagesBatch(state: MessageReencryptState): Promise<boolean> {
    const rows = await this.prisma.message.findMany({
      where: { id: { gt: state.cursor } },
      select: { id: true, body_original: true, body_display: true },
      orderBy: { id: 'asc' },
      take: MESSAGE_REENCRYPT_BATCH,
    });
    for (const row of rows) {
      state.scanned += 1;
      const data: { body_original?: string; body_display?: string } = {};
      let stuck = false;
      for (const col of ['body_original', 'body_display'] as const) {
        const stored = row[col];
        if (!this.cipher.needsReseal(stored)) continue;
        const next = this.cipher.reseal(stored, row.id);
        if (next === null) {
          this.count(state, stored, 'failed');
          stuck = true;
          continue;
        }
        this.count(state, stored, 'rewritten');
        data[col] = next;
      }
      if (Object.keys(data).length > 0) {
        await this.prisma.message.update({ where: { id: row.id }, data });
        state.rewritten += 1;
      }
      if (stuck) state.failed += 1;
      state.cursor = row.id;
    }
    return rows.length === MESSAGE_REENCRYPT_BATCH;
  }

  /** One batch of `message_edits`; the AAD id is the parent message's. */
  private async editsBatch(state: MessageReencryptState): Promise<boolean> {
    const rows = await this.prisma.messageEdit.findMany({
      where: { id: { gt: state.cursor } },
      select: { id: true, message_id: true, body_original: true },
      orderBy: { id: 'asc' },
      take: MESSAGE_REENCRYPT_BATCH,
    });
    for (const row of rows) {
      state.scanned += 1;
      if (this.cipher.needsReseal(row.body_original)) {
        const next = this.cipher.reseal(row.body_original, row.message_id);
        if (next === null) {
          state.failed += 1;
          this.count(state, row.body_original, 'failed');
        } else {
          this.count(state, row.body_original, 'rewritten');
          await this.prisma.messageEdit.update({
            where: { id: row.id },
            data: { body_original: next },
          });
          state.rewritten += 1;
        }
      }
      state.cursor = row.id;
    }
    return rows.length === MESSAGE_REENCRYPT_BATCH;
  }

  private count(
    state: MessageReencryptState,
    stored: string,
    what: 'rewritten' | 'failed',
  ): void {
    const kid = MessageBodyCipher.kidOf(stored) ?? '?';
    const entry = (state.byKid[kid] ??= { rewritten: 0, failed: 0 });
    entry[what] += 1;
  }
}
