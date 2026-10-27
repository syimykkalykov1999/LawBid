import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { StaffSettingsService } from '../staff-core/staff-settings.service';
import { StaffAnomalyService } from './staff-anomaly.service';
import { StaffCardWatch } from './staff-card-watch';
import { utcDay } from './staff-security.util';

function fake(stored: Record<string, unknown> = {}, lease: unknown = null) {
  const counters = new Map<string, number>();
  const hashes = new Map<string, Record<string, string>>();
  const redis = {
    multi: () => {
      const ops: Array<() => unknown> = [];
      const chain = {
        incr: (k: string) => {
          ops.push(() => {
            counters.set(k, (counters.get(k) ?? 0) + 1);
            return counters.get(k);
          });
          return chain;
        },
        hincrby: (h: string, f: string, n: number) => {
          ops.push(() => {
            const row = hashes.get(h) ?? {};
            row[f] = String(Number(row[f] ?? 0) + n);
            hashes.set(h, row);
            return row[f];
          });
          return chain;
        },
        expire: () => {
          ops.push(() => 1);
          return chain;
        },
        exec: () => Promise.resolve(ops.map((op) => [null, op()])),
      };
      return chain;
    },
    hincrby: (h: string, f: string, n: number) => {
      const row = hashes.get(h) ?? {};
      row[f] = String(Number(row[f] ?? 0) + n);
      hashes.set(h, row);
      return Promise.resolve(Number(row[f]));
    },
    hgetall: (h: string) => Promise.resolve(hashes.get(h) ?? {}),
  };
  const workLease = { findFirst: jest.fn(() => Promise.resolve(lease)) };
  const staff = new StaffSettingsService({
    all: () => Promise.resolve(stored),
  } as unknown as AppSettingsService);
  const watch = new StaffCardWatch(
    redis as never,
    { workLease } as never,
    staff,
  );
  return { watch, workLease, staff };
}

describe('StaffCardWatch (staff package T11 detector counters)', () => {
  it('counts opened cards and the minutes over the cards-per-minute limit', async () => {
    const { watch } = fake({ 'staff.cards_per_minute': 5 });
    for (let i = 0; i < 8; i++) {
      await watch.noteOpened('a', { area: 'users', id: 'x' });
    }
    const day = (await watch.readDay(utcDay())).get('a');
    // 8 cards in one minute with a limit of 5: one burst minute (counted once)
    expect(day).toMatchObject({ opened: 8, burst: 1, outside: 0 });
  });

  it('a lease-queue card without the lease counts as outside (only with leases on)', async () => {
    const off = fake({}, null);
    await off.watch.noteOpened('a', { area: 'verification', id: 'x' });
    expect(off.workLease.findFirst).not.toHaveBeenCalled();

    const on = fake({ 'staff.lease_enabled': true }, null);
    await on.watch.noteOpened('a', { area: 'verification', id: 'x' });
    expect(on.workLease.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        kind: { in: ['verification'] },
        admin_id: 'a',
      }),
      select: { id: true },
    });
    expect((await on.watch.readDay(utcDay())).get('a')?.outside).toBe(1);
  });

  it('holding the lease is not outside; a section without a queue is never outside', async () => {
    const held = fake({ 'staff.lease_enabled': true }, { id: 'l1' });
    await held.watch.noteOpened('a', { area: 'support', id: 'x' });
    expect((await held.watch.readDay(utcDay())).get('a')?.outside).toBe(0);
    const users = fake({ 'staff.lease_enabled': true }, null);
    await users.watch.noteOpened('a', { area: 'users', id: 'x' });
    expect(users.workLease.findFirst).not.toHaveBeenCalled();
  });

  it('never throws into the request', async () => {
    const { watch } = fake();
    (watch as unknown as { redis: unknown }).redis = {
      multi: () => {
        throw new Error('redis down');
      },
    };
    await expect(
      watch.noteOpened('a', { area: 'users', id: 'x' }),
    ).resolves.toBeUndefined();
    await expect(watch.noteReveal('a')).resolves.toBeUndefined();
  });

  it('StaffAnomalyService writes the top rows (one per day+admin+rule) and the digest', async () => {
    const { watch, staff } = fake({ 'staff.cards_per_minute': 5 });
    for (let i = 0; i < 6; i++)
      await watch.noteOpened('adm-1', { area: 'users', id: 'x' });
    const upsert = jest.fn(() => Promise.resolve());
    const svc = new StaffAnomalyService(
      watch,
      { staffAnomaly: { upsert } } as never,
      staff,
    );
    const r = await svc.computeDay(utcDay());
    expect(r).toMatchObject({ admins: 1, rows: 1 });
    expect(r.digest).toContain('слишком быстро');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          admin_id: 'adm-1',
          rule: 'cards_burst',
        }),
      }),
    );
  });
});
