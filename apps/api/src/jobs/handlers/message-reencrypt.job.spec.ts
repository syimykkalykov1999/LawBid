/* eslint-disable @typescript-eslint/require-await -- async mocks mirror the real signatures */
import { ConfigService } from '@nestjs/config';
import { MessageBodyCipher } from '../../common/secrets/message-body-cipher';
import { SecretEnvelope } from '../../common/secrets/secret-envelope';
import {
  MESSAGE_REENCRYPT_BATCH,
  MESSAGE_REENCRYPT_DB_KEY,
  MESSAGE_REENCRYPT_STATE_KEY,
  MessageReencryptJob,
  reencryptBatchesFor,
  type MessageReencryptState,
} from './message-reencrypt.job';

const K1 = 'm1:0123456789abcdef0123456789abcdef';
const K2 = 'm2:fedcba9876543210fedcba9876543210';
const K3 = 'm3:00000000000000000000000000000000';
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const legacyV2 = (plain: string) =>
  'enc:' + new SecretEnvelope(K1, 'm1').encrypt(plain, 'messages.body');
const sealedUnderK3 = (plain: string, msgId: string) =>
  'enc:v3' +
  new SecretEnvelope(K3, 'm3')
    .encrypt(plain, `messages.body:${msgId}`)
    .slice(2);

interface Row {
  id: string;
  body_original: string;
  body_display: string;
  file_name?: string | null;
}
interface CaseRow {
  id: string;
  private_details: string | null;
}
interface Edit {
  id: string;
  message_id: string;
  body_original: string;
}

function harness(
  messages: Row[],
  edits: Edit[],
  keys: string,
  active: string,
  cases: CaseRow[] = [],
  sealOn = true,
) {
  const redisStore = new Map<string, string>();
  const redis = {
    get: jest.fn((k: string) => Promise.resolve(redisStore.get(k) ?? null)),
    set: jest.fn((k: string, v: string) => {
      redisStore.set(k, v);
      return Promise.resolve('OK');
    }),
    del: jest.fn((k: string) => {
      redisStore.delete(k);
      return Promise.resolve(1);
    }),
  };
  const page = <T extends { id: string }>(
    rows: T[],
    args: { where: { id: { gt: string } }; take: number },
  ) =>
    rows
      .filter((r) => r.id > args.where.id.gt)
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .slice(0, args.take);
  const prisma = {
    message: {
      findMany: jest.fn((args: never) => Promise.resolve(page(messages, args))),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id?: string; id_conversation_id?: { id: string } };
          data: Partial<Row>;
        }) => {
          // messages carry a composite key (id, conversation_id) since the
          // partitioning prep.
          const id = where.id ?? where.id_conversation_id?.id;
          Object.assign(
            messages.find((m) => m.id === id)!,
            data,
          );
          return Promise.resolve();
        },
      ),
    },
    case: {
      findMany: jest.fn((args: never) => Promise.resolve(page(cases, args))),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<CaseRow>;
        }) => {
          Object.assign(
            cases.find((m) => m.id === where.id)!,
            data,
          );
          return Promise.resolve();
        },
      ),
    },
    messageEdit: {
      findMany: jest.fn((args: never) => Promise.resolve(page(edits, args))),
      update: jest.fn(
        ({ where, data }: { where: { id: string }; data: Partial<Edit> }) => {
          Object.assign(
            edits.find((m) => m.id === where.id)!,
            data,
          );
          return Promise.resolve();
        },
      ),
    },
  };
  const cipher = new MessageBodyCipher(
    new ConfigService({
      MESSAGE_ENC_KEYS: keys,
      MESSAGE_ENC_ACTIVE_KID: active,
    }),
  );
  const logger = { setContext: jest.fn(), info: jest.fn() };
  const secrets = {
    reencryptStores: jest.fn().mockResolvedValue({
      joinCodes: 0,
      registries: 0,
      adminTotp: 0,
      failed: 0,
    }),
  };
  const settings = {
    boolean: jest.fn().mockResolvedValue(sealOn),
  };
  const job = new MessageReencryptJob(
    prisma as never,
    redis as never,
    cipher,
    logger as never,
    secrets as never,
    settings as never,
  );
  const state = () =>
    JSON.parse(
      redisStore.get(MESSAGE_REENCRYPT_STATE_KEY)!,
    ) as MessageReencryptState;
  return { job, prisma, redis, cipher, logger, state, redisStore, secrets };
}

const noSleep = () => Promise.resolve();

describe('MessageReencryptJob', () => {
  it('is a no-op without keys', async () => {
    const h = harness([], [], '', '');
    expect(await h.job.run(new Date(), noSleep)).toBeNull();
    expect(h.prisma.message.findMany).not.toHaveBeenCalled();
  });

  it('rewrites v2 rows and retired-kid rows as v3 under the active key, skips the rest, counts a stuck row per kid', async () => {
    const m1 = id(1);
    const m2 = id(2);
    const m3 = id(3);
    const m4 = id(4);
    const active = new MessageBodyCipher(
      new ConfigService({
        MESSAGE_ENC_KEYS: `${K1},${K2}`,
        MESSAGE_ENC_ACTIVE_KID: 'm2',
      }),
    );
    const messages: Row[] = [
      {
        id: m1,
        body_original: legacyV2('hello'),
        body_display: legacyV2('hello'),
      },
      {
        id: m2,
        body_original: 'system.call.missed',
        body_display: '[deleted]',
      },
      {
        id: m3,
        body_original: active.seal('fresh', m3),
        body_display: active.seal('fresh', m3),
      },
      // Sealed under m3, which is no longer in the key list: cannot be opened.
      {
        id: m4,
        body_original: sealedUnderK3('lost', m4),
        body_display: legacyV2('ok'),
      },
    ];
    const edits: Edit[] = [
      { id: id(10), message_id: m1, body_original: legacyV2('hello v0') },
      { id: id(11), message_id: m3, body_original: 'plain edit' },
    ];
    const h = harness(messages, edits, `${K1},${K2}`, 'm2');
    const res = await h.job.run(new Date('2026-10-22T10:00:00Z'), noSleep);
    expect(res).toEqual({ phase: 'done', scanned: 6, rewritten: 3, failed: 1 });

    // m1: both columns now v3 under m2 and still readable.
    expect(messages[0].body_original.startsWith('enc:v3.m2.')).toBe(true);
    expect(h.cipher.open(messages[0].body_original, m1)).toBe('hello');
    expect(h.cipher.open(messages[0].body_display, m1)).toBe('hello');
    // m2 (plaintext) and m3 (already current) untouched.
    expect(messages[1]).toEqual({
      id: m2,
      body_original: 'system.call.missed',
      body_display: '[deleted]',
    });
    expect(h.prisma.message.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: m3 } }),
    );
    // m4: the readable column was rewritten, the stuck one left alone.
    expect(messages[3].body_original.startsWith('enc:v3.m3.')).toBe(true);
    expect(messages[3].body_display.startsWith('enc:v3.m2.')).toBe(true);
    // Edit copies use the parent message id as AAD.
    expect(h.cipher.open(edits[0].body_original, m1)).toBe('hello v0');
    expect(edits[1].body_original).toBe('plain edit');

    const s = h.state();
    expect(s.phase).toBe('done');
    expect(s.finishedAt).not.toBeNull();
    expect(s.byKid).toEqual({
      // Columns, not rows: m1 twice, m4's display, the edit copy.
      m1: { rewritten: 4, failed: 0 },
      m3: { rewritten: 0, failed: 1 },
    });
    // No text in the log, counts only.
    const logged = JSON.stringify(h.logger.info.mock.calls);
    expect(logged).not.toContain('hello');
    expect(logged).toContain('"rewritten":3');
  });

  it('resumes from the cursor across runs and restarts when the key set changes', async () => {
    const n = MESSAGE_REENCRYPT_BATCH * 9 + 5; // more than one run (8 batches)
    const messages: Row[] = Array.from({ length: n }, (_, i) => ({
      id: id(i + 1),
      body_original: legacyV2(`t${i}`),
      body_display: '',
    }));
    const h = harness(messages, [], `${K1},${K2}`, 'm2');
    const first = await h.job.run(new Date(), noSleep);
    expect(first?.phase).toBe('messages');
    expect(first?.scanned).toBe(MESSAGE_REENCRYPT_BATCH * 8);
    const cursorAfterFirst = h.state().cursor;
    expect(cursorAfterFirst).toBe(id(MESSAGE_REENCRYPT_BATCH * 8));

    const second = await h.job.run(new Date(), noSleep);
    expect(second).toEqual({
      phase: 'done',
      scanned: n,
      rewritten: n,
      failed: 0,
    });
    // A finished pass does nothing more.
    h.prisma.message.findMany.mockClear();
    await h.job.run(new Date(), noSleep);
    expect(h.prisma.message.findMany).not.toHaveBeenCalled();

    // A new active kid → a fresh pass from the start.
    const h2 = harness(messages, [], `${K1},${K2},${K3}`, 'm3');
    h2.redisStore.set(MESSAGE_REENCRYPT_STATE_KEY, JSON.stringify(h.state()));
    const third = await h2.job.run(new Date(), noSleep);
    expect(third?.phase).toBe('messages');
    expect(h2.state().activeKid).toBe('m3');
    expect(h2.state().scanned).toBe(MESSAGE_REENCRYPT_BATCH * 8);

    // The admin button forgets the progress.
    await h2.job.restart();
    expect(h2.redisStore.has(MESSAGE_REENCRYPT_STATE_KEY)).toBe(false);
  });

  it('seals plaintext file names and private details (S3-5), counts per-kid rows (S3-2) and runs the key-store step (S3-4)', async () => {
    const m1 = id(1);
    const c1 = id(100);
    const messages: Row[] = [
      {
        id: m1,
        body_original: legacyV2('hi'),
        body_display: legacyV2('hi'),
        file_name: 'Divorce_agreement_Ivanov.pdf',
      },
      { id: id(2), body_original: '', body_display: '', file_name: null },
    ];
    const cases: CaseRow[] = [
      { id: c1, private_details: 'Client lives at 5 Elm St' },
      { id: id(101), private_details: null },
    ];
    const h = harness(messages, [], K1 + ',' + K2, 'm2', cases);
    h.secrets.reencryptStores.mockResolvedValue({
      joinCodes: 1,
      registries: 2,
      adminTotp: 1,
      failed: 0,
    });
    const res = await h.job.run(new Date(), noSleep);
    expect(res?.phase).toBe('done');
    const name = messages[0].file_name!;
    expect(name.startsWith('encf:v2.m2.')).toBe(true);
    expect(name).not.toContain('Divorce');
    expect(h.cipher.openField(name, `messages.file_name:${m1}`)).toBe(
      'Divorce_agreement_Ivanov.pdf',
    );
    // Bound to its row: another message id cannot open it.
    expect(h.cipher.openField(name, `messages.file_name:${id(2)}`)).toBe('');
    expect(cases[0].private_details!.startsWith('encf:')).toBe(true);
    expect(
      h.cipher.openField(
        cases[0].private_details!,
        `cases.private_details:${c1}`,
      ),
    ).toBe('Client lives at 5 Elm St');
    expect(cases[1].private_details).toBeNull();
    expect(h.state().kidRows).toEqual({ m1: 1 });
    expect(h.state().stores).toEqual({
      joinCodes: 1,
      registries: 2,
      adminTotp: 1,
      failed: 0,
    });
    // A second pass finds nothing left to seal.
    h.prisma.message.update.mockClear();
    await h.job.restart();
    await h.job.run(new Date(), noSleep);
    expect(h.prisma.message.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ file_name: expect.anything() }),
      }),
    );
  });

  it('with the switch off, plaintext stays and already sealed values still rotate', async () => {
    const m1 = id(1);
    const old = new MessageBodyCipher(
      new ConfigService({ MESSAGE_ENC_KEYS: K1, MESSAGE_ENC_ACTIVE_KID: 'm1' }),
    );
    const messages: Row[] = [
      {
        id: m1,
        body_original: '',
        body_display: '',
        file_name: 'plain.pdf',
      },
      {
        id: id(2),
        body_original: '',
        body_display: '',
        file_name: old.sealField('old-kid.pdf', `messages.file_name:${id(2)}`),
      },
    ];
    const h = harness(messages, [], K1 + ',' + K2, 'm2', [], false);
    await h.job.run(new Date(), noSleep);
    expect(messages[0].file_name).toBe('plain.pdf');
    expect(messages[1].file_name!.startsWith('encf:v2.m2.')).toBe(true);
    expect(
      h.cipher.openField(messages[1].file_name!, `messages.file_name:${id(2)}`),
    ).toBe('old-kid.pdf');
  });
});

describe('S20-8: ceiling and database copy of the progress', () => {
  it('rows per minute → batches per 5-minute tick (0 = paused)', () => {
    expect(reencryptBatchesFor(0)).toBe(0);
    expect(reencryptBatchesFor(-5)).toBe(0);
    expect(reencryptBatchesFor(10)).toBe(1);
    expect(reencryptBatchesFor(800)).toBe(8);
    expect(reencryptBatchesFor(20_000)).toBe(200);
  });

  it('restores the progress from the database when Redis lost it', async () => {
    const saved = { fingerprint: 'f', phase: 'edits', cursor: 'c' };
    const redisStore = new Map<string, string>();
    const prisma = {
      searchIndexState: {
        findUnique: jest.fn().mockResolvedValue({ value: saved }),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    const redis = {
      get: jest.fn(async (k: string) => redisStore.get(k) ?? null),
      set: jest.fn(async (k: string, v: string) => {
        redisStore.set(k, v);
        return 'OK';
      }),
      del: jest.fn(async (k: string) => redisStore.delete(k)),
    };
    const job = new MessageReencryptJob(
      prisma as never,
      redis as never,
      {} as never,
      { setContext: jest.fn() } as never,
      {} as never,
      {} as never,
    );
    expect(await job.state()).toEqual(saved);
    expect(redis.set).toHaveBeenCalledTimes(1);
    await job.restart();
    expect(prisma.searchIndexState.deleteMany).toHaveBeenCalledWith({
      where: { key: MESSAGE_REENCRYPT_DB_KEY },
    });
  });
});
