import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  DISPOSABLE_MIN_DOMAINS,
  DisposableDomainsRefreshJob,
  parseDomainList,
} from './disposable-domains-refresh.job';
import type { DisposableDomainsFetcher } from './disposable-domains.fetcher';

interface Row {
  domain: string;
  reason: string;
}

/** In-memory blocked_email_domains with the three calls the job makes. */
function fakePrisma(initial: Row[]) {
  const table = new Map(initial.map((r) => [r.domain, r.reason]));
  const writes = { createMany: 0, deleteMany: 0 };
  const prisma = {
    blockedEmailDomain: {
      findMany: jest.fn(() =>
        Promise.resolve(
          [...table].map(([domain, reason]) => ({ domain, reason })),
        ),
      ),
      createMany: jest.fn(({ data }: { data: Row[] }) => {
        writes.createMany += 1;
        let count = 0;
        for (const r of data) {
          if (!table.has(r.domain)) {
            table.set(r.domain, r.reason);
            count += 1;
          }
        }
        return Promise.resolve({ count });
      }),
      deleteMany: jest.fn(
        ({
          where,
        }: {
          where: { reason: string; domain: { in: string[] } };
        }) => {
          writes.deleteMany += 1;
          let count = 0;
          for (const d of where.domain.in) {
            if (table.get(d) === where.reason) {
              table.delete(d);
              count += 1;
            }
          }
          return Promise.resolve({ count });
        },
      ),
    },
  };
  return {
    prisma: prisma as unknown as PrismaService,
    mocks: prisma.blockedEmailDomain,
    table,
    writes,
  };
}

const warn = jest.fn();
const logger = {
  setContext: jest.fn(),
  info: jest.fn(),
  warn,
} as unknown as PinoLogger;

const config = {
  getOrThrow: () => 'https://example.test/list.conf',
} as unknown as ConfigService;

function domains(n: number, prefix = 'tmp'): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}${i}.example`);
}

function makeJob(prisma: PrismaService, fetch: () => Promise<string>) {
  const fetcher: DisposableDomainsFetcher = { fetch: jest.fn(fetch) };
  return {
    job: new DisposableDomainsRefreshJob(prisma, config, fetcher, logger),
    fetcher,
  };
}

const APPLE: Row = {
  domain: 'privaterelay.appleid.com',
  reason: 'apple_relay',
};

describe('parseDomainList', () => {
  it('normalizes, strips comments/blank lines, de-duplicates and sorts', () => {
    const text = [
      '# header',
      'Mailinator.COM',
      '',
      '  guerrillamail.com  # trailing comment',
      'mailinator.com',
      'xn--80ak6aa92e.xn--p1ai',
      'sub.domain.co.uk\r',
    ].join('\n');
    expect(parseDomainList(text)).toEqual({
      domains: [
        'guerrillamail.com',
        'mailinator.com',
        'sub.domain.co.uk',
        'xn--80ak6aa92e.xn--p1ai',
      ],
      invalid: 0,
    });
  });

  it.each([
    'localhost',
    '-bad.com',
    'bad-.com',
    'under_score.com',
    'has space.com',
    '<html>',
    'a..b.com',
    `${'a'.repeat(64)}.com`,
    'mail.123',
  ])('rejects %p', (line) => {
    expect(parseDomainList(line)).toEqual({ domains: [], invalid: 1 });
  });
});

describe('DisposableDomainsRefreshJob (docs/02 §3.3)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('adds new domains, removes stale disposable ones, never touches apple_relay', async () => {
    const fresh = domains(DISPOSABLE_MIN_DOMAINS + 10);
    const { prisma, table } = fakePrisma([
      APPLE,
      { domain: 'stale.example', reason: 'disposable' },
      { domain: fresh[0], reason: 'disposable' },
    ]);
    // The upstream list also (wrongly) contains the Apple relay domain.
    const { job } = makeJob(prisma, () =>
      Promise.resolve([...fresh, APPLE.domain].join('\n')),
    );

    const result = await job.run();

    expect(result).toEqual({
      status: 'updated',
      added: fresh.length - 1,
      removed: 1,
      total: fresh.length,
    });
    expect(table.get(APPLE.domain)).toBe('apple_relay');
    expect(table.has('stale.example')).toBe(false);
    expect(table.size).toBe(fresh.length + 1);
  });

  it('is idempotent: a second run with the same list changes nothing', async () => {
    const list = domains(DISPOSABLE_MIN_DOMAINS + 1).join('\n');
    const { prisma, writes } = fakePrisma([APPLE]);
    const { job } = makeJob(prisma, () => Promise.resolve(list));
    await job.run();
    const before = { ...writes };
    await expect(job.run()).resolves.toEqual({
      status: 'updated',
      added: 0,
      removed: 0,
      total: DISPOSABLE_MIN_DOMAINS + 1,
    });
    expect(writes).toEqual(before);
  });

  it.each([
    ['fetch_failed', () => Promise.reject(new Error('ECONNRESET'))],
    [
      'too_few_domains',
      () => Promise.resolve(domains(DISPOSABLE_MIN_DOMAINS - 1).join('\n')),
    ],
    [
      'too_many_invalid_lines',
      () =>
        Promise.resolve(
          [...domains(DISPOSABLE_MIN_DOMAINS), ...Array(50).fill('<div>')].join(
            '\n',
          ),
        ),
    ],
    ['too_many_invalid_lines', () => Promise.resolve('<!doctype html>')],
    ['too_few_domains', () => Promise.resolve('')],
  ])(
    'fail-safe %s: keeps current data and logs a warning',
    async (reason, fetch) => {
      const { prisma, mocks, table } = fakePrisma([
        APPLE,
        { domain: 'mailinator.com', reason: 'disposable' },
      ]);
      const snapshot = new Map(table);
      const { job } = makeJob(prisma, fetch);

      await expect(job.run()).resolves.toEqual({ status: 'skipped', reason });

      expect(table).toEqual(snapshot);
      expect(mocks.createMany).not.toHaveBeenCalled();
      expect(mocks.deleteMany).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({ reason }),
        expect.stringContaining('keeping current list'),
      );
    },
  );

  it('refuses a list that would drop more than half of the current entries', async () => {
    const current = domains(4 * DISPOSABLE_MIN_DOMAINS, 'old');
    const { prisma, table } = fakePrisma(
      current.map((domain) => ({ domain, reason: 'disposable' })),
    );
    const { job } = makeJob(prisma, () =>
      Promise.resolve(domains(DISPOSABLE_MIN_DOMAINS + 5).join('\n')),
    );
    await expect(job.run()).resolves.toEqual({
      status: 'skipped',
      reason: 'shrinks_too_much',
    });
    expect(table.size).toBe(current.length);
  });

  it('writes in bounded chunks (short statements)', async () => {
    const { prisma, mocks } = fakePrisma([]);
    const { job } = makeJob(prisma, () =>
      Promise.resolve(domains(2_500).join('\n')),
    );
    await job.run();
    expect(mocks.createMany).toHaveBeenCalledTimes(3);
    for (const [arg] of mocks.createMany.mock.calls as [
      { data: Row[]; skipDuplicates: boolean },
    ][]) {
      expect(arg.data.length).toBeLessThanOrEqual(1_000);
      expect(arg.skipDuplicates).toBe(true);
    }
  });
});
