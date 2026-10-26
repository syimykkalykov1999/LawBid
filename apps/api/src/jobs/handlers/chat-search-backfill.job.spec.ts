/* eslint-disable @typescript-eslint/require-await -- hand-made fakes */
import type { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import type { PinoLogger } from 'nestjs-pino';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { MessageBodyCipher } from '../../common/secrets/message-body-cipher';
import { MessageSearchIndex } from '../../common/secrets/message-search-index';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  CHAT_SEARCH_BACKFILL_BATCH,
  ChatSearchBackfillJob,
  type ChatSearchBackfillState,
} from './chat-search-backfill.job';

const NIGHT = new Date('2026-10-26T07:00:00Z');
const DAY = new Date('2026-10-26T15:00:00Z');
const noSleep = async () => undefined;

interface Msg {
  id: string;
  conversation_id: string;
  type: string;
  body_display: string;
  edited_at: Date | null;
  revoked_at: Date | null;
  deleted_at: Date | null;
}

function build(opts: {
  messages?: Msg[];
  mode?: string;
  rowsPerRun?: number;
  key?: string | null;
  /** Rows the FOR SHARE re-read reports as changed meanwhile. */
  changed?: Record<string, Partial<Msg>>;
}) {
  const env: Record<string, string | undefined> = {
    SEARCH_INDEX_KEY:
      opts.key === null
        ? undefined
        : (opts.key ?? 'Zq8vR2mW5xT9pL4nB7cK1fH6jD3sG0aY'),
    MESSAGE_ENC_KEYS: 'm1:a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8',
    MESSAGE_ENC_ACTIVE_KID: 'm1',
  };
  const config = { get: (k: string) => env[k] } as unknown as ConfigService;
  const cipher = new MessageBodyCipher(config);
  const settings = {
    string: jest.fn(async () => opts.mode ?? 'auto'),
    number: jest.fn(async () => opts.rowsPerRun ?? 5000),
    boolean: jest.fn(async () => false),
  } as unknown as AppSettingsService;
  const index = new MessageSearchIndex(config, cipher, settings);
  const messages = [...(opts.messages ?? [])].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  const tokens: { message_id: string; token: Buffer }[] = [];
  const deleted: string[][] = [];
  const findMany = jest.fn(
    async (args: { where: { id: { gt: string } }; take: number }) =>
      messages.filter((m) => m.id > args.where.id.gt).slice(0, args.take),
  );
  const tx = {
    $queryRaw: jest.fn(async (_s: TemplateStringsArray, ids: string[]) =>
      messages
        .filter((m) => ids.includes(m.id))
        .map((m) => ({ ...m, ...(opts.changed?.[m.id] ?? {}) })),
    ),
    messageSearchToken: {
      deleteMany: jest.fn(
        async (a: { where: { message_id: { in: string[] } } }) => {
          deleted.push(a.where.message_id.in);
        },
      ),
      createMany: jest.fn(
        async (a: { data: { message_id: string; token: Buffer }[] }) => {
          tokens.push(...a.data);
        },
      ),
    },
  };
  const prisma = {
    message: { findMany },
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
  } as unknown as PrismaService;
  const store = new Map<string, string>();
  const redis = {
    get: jest.fn(async (k: string) => store.get(k) ?? null),
    set: jest.fn(async (k: string, v: string) => {
      store.set(k, v);
      return 'OK';
    }),
    del: jest.fn(async (k: string) => store.delete(k)),
  } as unknown as Redis;
  const logger = {
    setContext: jest.fn(),
    info: jest.fn(),
  } as unknown as PinoLogger;
  const job = new ChatSearchBackfillJob(
    prisma,
    redis,
    index,
    cipher,
    settings,
    logger,
  );
  return { job, index, cipher, tokens, deleted, findMany, store };
}

function msg(n: number, text: string, cipher?: MessageBodyCipher): Msg {
  const id = `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  return {
    id,
    conversation_id: 'c1',
    type: 'text',
    body_display: cipher ? cipher.seal(text, id) : text,
    edited_at: null,
    revoked_at: null,
    deleted_at: null,
  };
}

describe('ChatSearchBackfillJob', () => {
  it('opens sealed bodies and writes their tokens, then idles once done', async () => {
    const seed = build({});
    const messages = [
      msg(1, 'Invoice for Friday', seed.cipher),
      msg(2, 'hello', seed.cipher),
      { ...msg(3, 'secret', seed.cipher), type: 'voice' },
      { ...msg(4, 'gone', seed.cipher), revoked_at: new Date() },
    ];
    const { job, index, tokens, findMany } = build({ messages });
    const r = await job.run(NIGHT, noSleep);
    expect(r).toEqual({ scanned: 4, indexed: 2, failed: 0, done: true });
    const hex = tokens.map((t) => t.token.toString('hex'));
    expect(hex).toContain(index.tokensFor('invoice', false)[0].toString('hex'));
    expect(hex).toContain(index.tokensFor('hello', false)[0].toString('hex'));
    expect(hex).not.toContain(
      index.tokensFor('secret', false)[0].toString('hex'),
    );
    expect(hex).not.toContain(
      index.tokensFor('gone', false)[0].toString('hex'),
    );
    // Finished: the next tick reads nothing.
    findMany.mockClear();
    expect(await job.run(NIGHT, noSleep)).toEqual({ skipped: 'done' });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('resumes from the keyset cursor and respects the rows-per-run ceiling', async () => {
    const seed = build({});
    const messages = Array.from(
      { length: CHAT_SEARCH_BACKFILL_BATCH * 3 },
      (_, i) => msg(i + 1, `word${i}`, seed.cipher),
    );
    const { job, findMany, store } = build({
      messages,
      rowsPerRun: CHAT_SEARCH_BACKFILL_BATCH,
    });
    const first = await job.run(NIGHT, noSleep);
    expect(first).toMatchObject({
      scanned: CHAT_SEARCH_BACKFILL_BATCH,
      done: false,
    });
    expect(findMany).toHaveBeenCalledTimes(1);
    const state = JSON.parse([...store.values()][0]) as ChatSearchBackfillState;
    expect(state.cursor).toBe(messages[CHAT_SEARCH_BACKFILL_BATCH - 1].id);
    await job.run(NIGHT, noSleep);
    const lastCall = findMany.mock.calls[1][0];
    expect(lastCall.where.id.gt).toBe(
      messages[CHAT_SEARCH_BACKFILL_BATCH - 1].id,
    );
  });

  it('auto runs only at night; off never; on any time', async () => {
    const seed = build({});
    const messages = [msg(1, 'x', seed.cipher)];
    expect(await build({ messages }).job.run(DAY, noSleep)).toEqual({
      skipped: 'not_night',
    });
    expect(
      await build({ messages, mode: 'off' }).job.run(NIGHT, noSleep),
    ).toEqual({
      skipped: 'mode_off',
    });
    expect(
      await build({ messages, mode: 'on' }).job.run(DAY, noSleep),
    ).toMatchObject({
      indexed: 1,
    });
  });

  it('does nothing without SEARCH_INDEX_KEY', async () => {
    expect(await build({ key: null }).job.run(NIGHT, noSleep)).toEqual({
      skipped: 'disabled',
    });
  });

  it('skips a row edited or deleted between the read and the write', async () => {
    const seed = build({});
    const a = msg(1, 'alpha', seed.cipher);
    const b = msg(2, 'beta', seed.cipher);
    const { job, index, tokens, deleted } = build({
      messages: [a, b],
      changed: { [a.id]: { edited_at: new Date() } },
    });
    const r = await job.run(NIGHT, noSleep);
    expect(r).toMatchObject({ indexed: 1 });
    expect(deleted).toEqual([[b.id]]);
    const hex = tokens.map((t) => t.token.toString('hex'));
    expect(hex).toEqual([index.tokensFor('beta', false)[0].toString('hex')]);
  });

  it('counts a body that does not open, without indexing it', async () => {
    const seed = build({});
    const bad = msg(1, 'hello', seed.cipher);
    // Flip a character in the middle: the last base64 character may carry
    // only padding bits, so changing it sometimes left the bytes intact.
    const mid = Math.floor(bad.body_display.length / 2);
    const c = bad.body_display[mid];
    bad.body_display =
      bad.body_display.slice(0, mid) +
      (c === 'A' ? 'B' : 'A') +
      bad.body_display.slice(mid + 1);
    const r = await build({ messages: [bad] }).job.run(NIGHT, noSleep);
    expect(r).toMatchObject({ indexed: 0, failed: 1 });
  });

  it('a new key restarts the pass', async () => {
    const seed = build({});
    const messages = [msg(1, 'x', seed.cipher)];
    const first = build({ messages });
    await first.job.run(NIGHT, noSleep);
    const state = JSON.parse(
      [...first.store.values()][0],
    ) as ChatSearchBackfillState;
    expect(state.finishedAt).not.toBeNull();
    const second = build({ messages, key: 'Pp9vR2mW5xT9pL4nB7cK1fH6jD3sG0aZ' });
    second.store.set('ops:chat-search-backfill', JSON.stringify(state));
    expect(await second.job.run(NIGHT, noSleep)).toMatchObject({ indexed: 1 });
  });
});
