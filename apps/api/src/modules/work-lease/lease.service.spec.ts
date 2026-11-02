import type Redis from 'ioredis';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { StaffSettingsService } from '../staff-core/staff-settings.service';
import {
  decideSweep,
  LeaseService,
  MAX_AUTO_RENEWALS,
  type SweepPolicy,
  type SweepSubject,
} from './lease.service';
import type { StaffEventsPublisher } from './staff-events.publisher';
import type {
  PresenceReading,
  StaffPresenceService,
} from './staff-presence.service';

const settings = (stored: Record<string, unknown> = {}) =>
  new StaffSettingsService({
    all: () => Promise.resolve(stored),
  } as unknown as AppSettingsService);

/** A database that fails the test if anything touches it. */
const noDb = new Proxy(
  {},
  {
    get: (_t, prop) => {
      if (prop === 'then') return undefined;
      throw new Error(`DB touched: ${String(prop)}`);
    },
  },
) as unknown as PrismaService;

const noRedis = new Proxy(
  {},
  {
    get: (_t, prop) => {
      if (prop === 'then') return undefined;
      throw new Error(`Redis touched: ${String(prop)}`);
    },
  },
) as unknown as Redis;

const idleEvents = {
  toAdmin: jest.fn(),
  tile: jest.fn(),
} as unknown as StaffEventsPublisher;

describe('LeaseService with the switches off (the default)', () => {
  const svc = (stored: Record<string, unknown> = {}) =>
    new LeaseService(
      noDb,
      noRedis,
      settings(stored),
      {} as unknown as StaffPresenceService,
      idleEvents,
    );

  it('next / claim: answer `off` / null, no row and no Redis key', async () => {
    const s = svc();
    await expect(s.next('support_ticket', { adminId: 'a' })).resolves.toEqual({
      status: 'off',
    });
    await expect(s.claim('support_ticket', 'i', 'a')).resolves.toBeNull();
    await expect(s.servesQueue('support_ticket')).resolves.toBe(false);
    await expect(s.nextFor('verification', { adminId: 'a' })).resolves.toEqual({
      status: 'off',
    });
  });

  it('a per-queue switch without the master stays off (counts only under staff.lease_enabled)', async () => {
    const s = svc({ 'staff.lease_support_enabled': true });
    await expect(s.servesQueue('support_ticket')).resolves.toBe(false);
  });

  it('master on, only support on: other queues stay off', async () => {
    const s = svc({
      'staff.lease_enabled': true,
      'staff.lease_support_enabled': true,
    });
    await expect(s.servesQueue('support_ticket')).resolves.toBe(true);
    await expect(s.servesQueue('verification')).resolves.toBe(false);
    await expect(s.servesQueue('report')).resolves.toBe(false);
    // an unknown / not-yet-built kind is never served
    await expect(s.servesQueue('refund')).resolves.toBe(false);
  });

  it('reopen and sweep do nothing (and read nothing)', async () => {
    const s = svc();
    await expect(s.reopen('support_ticket', 'i')).resolves.toBeUndefined();
    await expect(s.sweep()).resolves.toEqual({ skipped: 'off' });
  });
});

describe('decideSweep', () => {
  const T0 = Date.parse('2026-10-27T10:00:00Z');
  const min = 60_000;
  const subject = (over: Partial<SweepSubject> = {}): SweepSubject => ({
    takenAt: new Date(T0),
    leasedUntil: new Date(T0 + 20 * min),
    lastRenewAt: new Date(T0),
    ttlMs: 20 * min,
    ...over,
  });
  const policy = (over: Partial<SweepPolicy> = {}): SweepPolicy => ({
    now: T0 + 5 * min,
    presenceOn: true,
    graceMs: 60_000,
    idleMs: 300_000,
    activeWindowMs: 180_000,
    ...over,
  });
  const presence = (over: Partial<PresenceReading> = {}): PresenceReading => ({
    seenMs: T0 + 5 * min - 10_000,
    signalling: true,
    activeMs: T0 + 5 * min - 20_000,
    manualAway: false,
    ...over,
  });

  it('holding, signalling, moving, not expired: keep', () => {
    expect(decideSweep(subject(), presence(), policy())).toEqual({
      action: 'keep',
    });
  });

  it('no signal for more than 60 s: back to the queue (disconnected)', () => {
    expect(
      decideSweep(
        subject(),
        presence({ seenMs: T0 + 5 * min - 61_000, signalling: false }),
        policy(),
      ),
    ).toEqual({ action: 'release', reason: 'disconnected' });
    // within the grace: nothing is lost
    expect(
      decideSweep(
        subject(),
        presence({ seenMs: T0 + 5 * min - 59_000, signalling: false }),
        policy(),
      ),
    ).toEqual({ action: 'keep' });
  });

  it('never signalled since taking it: released after the grace', () => {
    expect(
      decideSweep(
        subject({ takenAt: new Date(T0), lastRenewAt: new Date(T0) }),
        presence({ seenMs: null, signalling: false }),
        policy({ now: T0 + 61_000 }),
      ),
    ).toEqual({ action: 'release', reason: 'disconnected' });
  });

  it('tab open but no movement for 5 minutes: released (idle)', () => {
    expect(
      decideSweep(
        subject(),
        presence({ seenMs: T0 + 6 * min - 5_000, activeMs: null }),
        policy({ now: T0 + 6 * min }),
      ),
    ).toEqual({ action: 'release', reason: 'idle' });
    // moved 4 minutes ago: still held
    expect(
      decideSweep(
        subject(),
        presence({ seenMs: T0 + 6 * min - 5_000, activeMs: T0 + 2 * min }),
        policy({ now: T0 + 6 * min }),
      ),
    ).toEqual({ action: 'keep' });
  });

  it('past its time while online and moving: renewed on its own', () => {
    const now = T0 + 21 * min;
    expect(
      decideSweep(
        subject(),
        presence({ seenMs: now - 5_000, activeMs: now - 10_000 }),
        policy({ now }),
      ),
    ).toEqual({ action: 'renew' });
  });

  it('past its time and away (no movement within 3 min): expires', () => {
    const now = T0 + 21 * min;
    expect(
      decideSweep(
        subject({ lastRenewAt: new Date(now - 2 * min) }),
        presence({ seenMs: now - 5_000, activeMs: now - 4 * min }),
        policy({ now }),
      ),
    ).toEqual({ action: 'release', reason: 'expired' });
  });

  it('kept past the allowed renewals: «долго держал»', () => {
    const now = T0 + 20 * min * (MAX_AUTO_RENEWALS + 1) + min;
    expect(
      decideSweep(
        subject({
          leasedUntil: new Date(now - min),
          lastRenewAt: new Date(now - 2 * min),
        }),
        presence({ seenMs: now - 5_000, activeMs: now - 10_000 }),
        policy({ now }),
      ),
    ).toEqual({ action: 'release', reason: 'held_too_long' });
  });

  it('presence off: only the clock counts', () => {
    expect(
      decideSweep(
        subject(),
        null,
        policy({ presenceOn: false, now: T0 + 10 * min }),
      ),
    ).toEqual({ action: 'keep' });
    expect(
      decideSweep(
        subject(),
        null,
        policy({ presenceOn: false, now: T0 + 21 * min }),
      ),
    ).toEqual({ action: 'release', reason: 'expired' });
  });
});

describe('LeaseService.tryClaim under contention (load test round 2)', () => {
  const src = {
    kind: 'support_ticket',
    onClaimed: jest.fn().mockResolvedValue(true),
  };
  const svc = () =>
    new LeaseService(
      noDb,
      noRedis,
      settings(),
      {} as unknown as StaffPresenceService,
      idleEvents,
    ) as unknown as {
      tryClaim: (...a: unknown[]) => Promise<unknown>;
    };
  const tx = (locked: boolean) => {
    const sqls: string[] = [];
    return {
      sqls,
      $queryRaw: jest.fn((strings: TemplateStringsArray) => {
        const q = strings.join('?');
        sqls.push(q);
        if (q.includes('pg_try_advisory_xact_lock'))
          return Promise.resolve([{ ok: !locked }]);
        if (q.includes('INSERT INTO work_leases'))
          return Promise.resolve([
            {
              kind: 'support_ticket',
              item_id: 'i1',
              admin_id: 'a1',
              taken_at: new Date(),
              leased_until: new Date(),
              last_renew_at: new Date(),
              attempt: 1,
            },
          ]);
        return Promise.resolve([]);
      }),
      $executeRaw: jest.fn().mockResolvedValue(1),
      workLeaseEvent: { create: jest.fn().mockResolvedValue({}) },
    };
  };

  it('«Следующий» skips an item another worker is claiming right now, without waiting on it', async () => {
    const t = tx(true);
    await expect(
      svc().tryClaim(t, src, 'i1', 'a1', 600, 30, false, true),
    ).resolves.toBeNull();
    expect(t.sqls.some((q) => q.includes('INSERT INTO work_leases'))).toBe(
      false,
    );
  });

  it('a free item is claimed exactly as before', async () => {
    const t = tx(false);
    const view = await svc().tryClaim(t, src, 'i1', 'a1', 600, 30, false, true);
    expect(view).not.toBeNull();
    expect(t.sqls.some((q) => q.includes('INSERT INTO work_leases'))).toBe(
      true,
    );
  });

  it('a click on one item ([claim]) takes no try-lock (waits as before)', async () => {
    const t = tx(true);
    await svc().tryClaim(t, src, 'i1', 'a1', 600, 30);
    expect(t.sqls.some((q) => q.includes('pg_try_advisory_xact_lock'))).toBe(
      false,
    );
  });
});
