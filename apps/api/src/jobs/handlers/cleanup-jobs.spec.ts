import type { Prisma } from '@prisma/client';
import type Redis from 'ioredis';
import type { PinoLogger } from 'nestjs-pino';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  REVOKED_SESSION_RETENTION_DAYS,
  SessionsCleanupJob,
} from './sessions-cleanup.job';
import { OTP_KEY_PATTERNS, OtpCleanupJob } from './otp-cleanup.job';

const logger = {
  setContext: jest.fn(),
  info: jest.fn(),
} as unknown as PinoLogger;

describe('SessionsCleanupJob (docs/02 §6.4)', () => {
  function run(
    batches: { last_id: string | null; scanned: number; deleted: number }[],
  ) {
    const calls: Prisma.Sql[] = [];
    const $queryRaw = jest.fn((sql: Prisma.Sql) => {
      calls.push(sql);
      const b = batches[calls.length - 1];
      return Promise.resolve([
        {
          last_id: b.last_id,
          scanned: BigInt(b.scanned),
          deleted: BigInt(b.deleted),
        },
      ]);
    });
    const job = new SessionsCleanupJob(
      { $queryRaw } as unknown as PrismaService,
      logger,
    );
    return { job, calls };
  }

  it('walks the table by primary key until a short batch, summing results', async () => {
    const { job, calls } = run([
      {
        last_id: '10000000-0000-0000-0000-000000000000',
        scanned: 3,
        deleted: 1,
      },
      {
        last_id: '20000000-0000-0000-0000-000000000000',
        scanned: 3,
        deleted: 3,
      },
      {
        last_id: '30000000-0000-0000-0000-000000000000',
        scanned: 1,
        deleted: 0,
      },
    ]);
    const now = new Date('2026-09-27T00:00:00Z');

    await expect(job.run(now, 3)).resolves.toEqual({ scanned: 7, deleted: 4 });

    expect(calls).toHaveLength(3);
    // Cursor advances to the previous batch's max id.
    expect(calls[0].values[0]).toBe('00000000-0000-0000-0000-000000000000');
    expect(calls[1].values[0]).toBe('10000000-0000-0000-0000-000000000000');
    expect(calls[2].values[0]).toBe('20000000-0000-0000-0000-000000000000');
    expect(calls[0].values).toContain(3); // batch size
    expect(calls[0].values).toContainEqual(now);
    expect(calls[0].values).toContainEqual(
      new Date(now.getTime() - REVOKED_SESSION_RETENTION_DAYS * 86_400_000),
    );
  });

  it('deletes expired rows and old terminal revocations, never early-deletes rotated rows', async () => {
    const { job, calls } = run([{ last_id: null, scanned: 0, deleted: 0 }]);
    await job.run(new Date(), 1000);
    const sql = calls[0].sql.replace(/\s+/g, ' ');
    expect(sql).toContain('expires_at <');
    expect(sql).toContain("revoked_reason IS DISTINCT FROM 'rotated'");
    expect(sql).toContain('ORDER BY id LIMIT');
    expect(sql).toMatch(
      /DELETE FROM sessions WHERE id IN \( SELECT id FROM batch/,
    );
  });

  it('stops on an empty table', async () => {
    const { job, calls } = run([{ last_id: null, scanned: 0, deleted: 0 }]);
    await expect(job.run()).resolves.toEqual({ scanned: 0, deleted: 0 });
    expect(calls).toHaveLength(1);
  });
});

describe('OtpCleanupJob (docs/02 §6.4)', () => {
  it('scans every OTP/rate-limit key family and deletes only keys without a TTL', async () => {
    const pages: Record<string, [string, string[]][]> = {
      'otp:*': [
        ['7', ['otp:code:a', 'otp:att:a']],
        ['0', ['otp:lock:b']],
      ],
      'rl:*': [['0', []]],
    };
    const cursors: Record<string, number> = {};
    const scan = jest.fn((_cursor: string, _m: string, pattern: string) => {
      const i = cursors[pattern] ?? 0;
      cursors[pattern] = i + 1;
      return Promise.resolve(pages[pattern][i]);
    });
    // Pretend exactly one key of each page has no TTL.
    const evalFn = jest.fn(() => Promise.resolve(1));
    const job = new OtpCleanupJob(
      { scan, eval: evalFn } as unknown as Redis,
      logger,
    );

    await expect(job.run()).resolves.toEqual({ scanned: 3, deleted: 2 });

    expect(scan.mock.calls.map((c) => c[2])).toEqual([
      'otp:*',
      'otp:*',
      'rl:*',
    ]);
    expect(OTP_KEY_PATTERNS).toEqual(['otp:*', 'rl:*']);
    // Empty pages never reach Redis; keys go to the atomic Lua check.
    expect(evalFn).toHaveBeenCalledTimes(2);
    const [script, numKeys, ...keys] = evalFn.mock.calls[0] as unknown as [
      string,
      number,
      ...string[],
    ];
    expect(script).toContain("redis.call('PTTL', key) == -1");
    expect(numKeys).toBe(2);
    expect(keys).toEqual(['otp:code:a', 'otp:att:a']);
  });
});
