import type Redis from 'ioredis';
import type { PinoLogger } from 'nestjs-pino';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  LedgerReconcileService,
  reconcileScope,
} from './ledger-reconcile.service';

const NOW = new Date('2026-10-26T05:15:00Z');
const day = (n: number) => new Date(NOW.getTime() - n * 24 * 3600 * 1000);

describe('reconcileScope (review R-26: nightly cost must not grow with the ledger)', () => {
  it('off runs nothing', () => {
    expect(reconcileScope('off', NOW, null, 7)).toEqual({
      run: false,
      since: null,
    });
  });

  it('on checks the whole ledger every night', () => {
    expect(reconcileScope('on', NOW, day(1), 7)).toEqual({
      run: true,
      since: null,
    });
  });

  it('auto: a full check when none is recorded or the last one is a week old', () => {
    expect(reconcileScope('auto', NOW, null, 7).since).toBeNull();
    expect(reconcileScope('auto', NOW, day(7), 7).since).toBeNull();
  });

  it('auto: otherwise only the last N days', () => {
    const s = reconcileScope('auto', NOW, day(2), 7);
    expect(s.run).toBe(true);
    expect(s.since).toEqual(day(7));
    expect(reconcileScope('auto', NOW, day(2), 30).since).toEqual(day(30));
    expect(reconcileScope('auto', NOW, day(2), 0).since).toEqual(day(1)); // floor of 1 day
  });
});

describe('LedgerReconcileService.run scope', () => {
  function make(mode: string, lastFull: string | null) {
    const calls: string[] = [];
    const prisma = {
      $queryRaw: jest.fn((strings: TemplateStringsArray | { sql?: string }) => {
        const text = Array.isArray(strings)
          ? strings.join('?')
          : String((strings as { sql?: string }).sql ?? '');
        calls.push(text);
        if (text.includes('MIN(')) return Promise.resolve([{ t: null }]);
        if (text.includes('GROUP BY e.currency')) return Promise.resolve([]);
        if (text.includes('COUNT(*) AS n')) return Promise.resolve([{ n: 0n }]);
        return Promise.resolve([{ diff: 0n }]);
      }),
    };
    const redis = {
      get: jest.fn((k: string) =>
        Promise.resolve(k.endsWith('last-full') ? lastFull : null),
      ),
      set: jest.fn(() => Promise.resolve('OK')),
    };
    const settings = {
      string: jest.fn(() => Promise.resolve(mode)),
      number: jest.fn(() => Promise.resolve(7)),
    };
    const stripe = { available: jest.fn(() => Promise.resolve(false)) };
    const logger = { setContext: jest.fn(), info: jest.fn(), error: jest.fn() };
    const svc = new LedgerReconcileService(
      prisma as unknown as PrismaService,
      stripe as never,
      {} as never,
      redis as unknown as Redis,
      logger as unknown as PinoLogger,
      settings as never,
    );
    return { svc, prisma, redis, calls };
  }

  it('off: no database query at all, the result says skipped', async () => {
    const { svc, prisma } = make('off', null);
    const out = await svc.run(NOW);
    expect(out.scope).toBe('skipped');
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('auto with a recent full check: the window scope, and no full-table drift sum', async () => {
    const { svc, calls } = make('auto', day(2).toISOString());
    const out = await svc.run(NOW);
    expect(out.scope).toBe('window');
    expect(calls.some((c) => c.includes('refunded_cents'))).toBe(false);
  });

  it('auto without a recorded full check runs a full one and records it', async () => {
    const { svc, redis, calls } = make('auto', null);
    const out = await svc.run(NOW);
    expect(out.scope).toBe('full');
    expect(calls.some((c) => c.includes('refunded_cents'))).toBe(true);
    expect(redis.set).toHaveBeenCalledWith(
      'ledger:reconcile:last-full',
      NOW.toISOString(),
      'EX',
      expect.any(Number),
    );
  });
});
