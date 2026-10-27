import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import {
  DESK_NUMBER_KEYS,
  DESK_SWITCH_KEYS,
  StaffDeskReadController,
} from './staff-desk-read.controller';
import { resolveStaffSettings } from './staff-settings.service';
import type { StaffSettingsService } from './staff-settings.service';

const me = { id: 'a1' } as AdminActor;

function build(stored: Record<string, unknown> = {}, rows: unknown[] = []) {
  const settings = resolveStaffSettings(stored);
  const findMany = jest.fn(() => Promise.resolve(rows));
  const staff = {
    get: jest.fn(() => Promise.resolve(settings)),
    isOn: jest.fn((k: keyof typeof settings.switches) =>
      Promise.resolve(settings.switches[k]),
    ),
  } as unknown as StaffSettingsService;
  const prisma = {
    staffDailyStat: { findMany },
  } as unknown as PrismaService;
  return { ctl: new StaffDeskReadController(staff, prisma), findMany };
}

describe('worker desk reads (staff package T8)', () => {
  it('desk-settings: everything off by default, only the whitelist is shown', async () => {
    const { ctl } = build();
    const r = await ctl.deskSettings();
    expect(Object.keys(r.switches).sort()).toEqual(
      [...DESK_SWITCH_KEYS].sort(),
    );
    expect(Object.values(r.switches).every((v) => v === false)).toBe(true);
    expect(Object.keys(r.numbers).sort()).toEqual([...DESK_NUMBER_KEYS].sort());
    expect(r.numbers['staff.lease.ttl_verification_min']).toBe(20);
    // nothing about rates, rating thresholds or heads' scores leaks to a worker
    expect(
      Object.keys(r.numbers).some((k) =>
        /rating|piecework|head|retaliation/.test(k),
      ),
    ).toBe(false);
  });

  it('desk-settings: a per-queue lease switch counts only under the master lease switch', async () => {
    const { ctl } = build({ 'staff.lease_support_enabled': true });
    expect(
      (await ctl.deskSettings()).switches['staff.lease_support_enabled'],
    ).toBe(false);
    const on = build({
      'staff.lease_enabled': true,
      'staff.lease_support_enabled': true,
    });
    expect(
      (await on.ctl.deskSettings()).switches['staff.lease_support_enabled'],
    ).toBe(true);
  });

  it('desk-decisions: 404 while the worker-progress switch is off, no query', async () => {
    const { ctl, findMany } = build();
    await expect(ctl.deskDecisions(me, {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(findMany).not.toHaveBeenCalled();
  });

  it('desk-decisions: reads only my own nightly rows, newest first', async () => {
    const { ctl, findMany } = build({ 'staff.worker_progress_enabled': true }, [
      {
        day: new Date('2026-10-26'),
        decided: 12,
        avg_handle_sec: 90,
        reopened: 1,
        late_sla: 0,
        skips: 2,
      },
      {
        day: new Date('2026-10-25'),
        decided: 8,
        avg_handle_sec: 100,
        reopened: 0,
        late_sla: 1,
        skips: 0,
      },
    ]);
    const r = await ctl.deskDecisions(me, { days: 7 });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ admin_id: 'a1' }) as unknown,
        orderBy: { day: 'desc' },
        take: 7,
      }),
    );
    expect(r.decidedTotal).toBe(20);
    expect(r.days[0]).toEqual({
      day: '2026-10-26',
      decided: 12,
      avgHandleSec: 90,
      reopened: 1,
      lateSla: 0,
      skips: 2,
    });
  });
});
