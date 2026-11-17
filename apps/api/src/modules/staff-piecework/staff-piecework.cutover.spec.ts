import { BadRequestException } from '@nestjs/common';
import {
  A1,
  OWNER,
  emptyFx,
  makeService,
  rate,
  withPerson,
  type Fx,
} from '../../../test/support/staff-piecework-fixtures';
import { StaffPieceworkJob } from '../../jobs/handlers/staff-piecework.job';

/**
 * Row 180 follow-up B9: piecework pay days follow `admin.report_timezone`
 * (Nevada) like the rest of the admin, with a safe cut-over from the old
 * UTC days: across the switch every closed decision is paid exactly once —
 * no day paid twice, no hours skipped.
 */
describe('piecework days across the switch from UTC to the report time zone', () => {
  const H = 3_600_000;
  const at = (s: string) => new Date(s);

  /** One closed ticket every hour, 30 minutes past, over [from, to). */
  function hourly(fx: Fx, from: string, to: string) {
    for (let t = Date.parse(from) + H / 2; t < Date.parse(to); t += H) {
      fx.leaseDone.push({
        admin_id: A1,
        kind: 'support_ticket',
        created_at: new Date(t),
      });
    }
  }

  function world() {
    const fx = emptyFx();
    fx.windows = [];
    withPerson(fx, A1);
    fx.rates.push(rate('ticket', 100));
    fx.snapshots.push({ admin_id: A1, rating: 80, status: 'ok' }); // ×1.00
    hourly(fx, '2026-11-08T00:00:00Z', '2026-11-20T00:00:00Z');
    // Before the deploy the zone setting does not exist: the old UTC days.
    const stored: Record<string, unknown> = {
      'staff.piecework_enabled': true,
      'admin.report_timezone': 'UTC',
    };
    const m = makeService(fx, stored);
    const job = new StaffPieceworkJob(m.settings, m.svc);
    return { fx, stored, job, ...m };
  }

  it('old nightly runs, the deploy, new nightly runs: each hour paid once, no gap', async () => {
    const { fx, stored, job, svc } = world();
    // Old code: 02:15 UTC, «yesterday» = the UTC day before.
    for (const day of ['2026-11-09', '2026-11-10', '2026-11-11']) {
      await svc.computeDay(day);
    }
    // Deploy on the 12th at 05:00 UTC: the zone is Nevada from now on.
    stored['admin.report_timezone'] = 'America/Los_Angeles';
    // First new run (its cron moved to 10:15 UTC), then daily.
    for (let d = 12; d <= 18; d++) {
      await job.run(at(`2026-11-${d}T10:15:00Z`));
    }
    // A late, repeated run of the same day changes nothing.
    await job.run(at('2026-11-18T10:15:00Z'));

    // Every accrual is still pending: nothing was canceled / re-issued.
    expect(fx.accruals.every((a) => a.status === 'pending')).toBe(true);
    const refs = fx.accruals.map((a) => a.event_ref as string);
    expect(new Set(refs).size).toBe(refs.length);
    expect(refs).toEqual([
      `staff_piecework:${A1}:2026-11-09`,
      `staff_piecework:${A1}:2026-11-10`,
      `staff_piecework:${A1}:2026-11-11`,
      `staff_piecework:${A1}:2026-11-12`, // the switch day, 32 h
      `staff_piecework:${A1}:2026-11-13`,
      `staff_piecework:${A1}:2026-11-14`,
      `staff_piecework:${A1}:2026-11-15`,
      `staff_piecework:${A1}:2026-11-16`,
      `staff_piecework:${A1}:2026-11-17`,
    ]);
    // The paid days tile the time: 09 00:00 UTC … 18 08:00 UTC (Nevada
    // midnight), each hour once: 9 × 24 + 8 = 224 tickets × 100 ¢.
    const paid = fx.accruals.reduce((s, a) => s + Number(a.amount_cents), 0);
    expect(paid).toBe(224 * 100);
    const byDay = new Map(
      fx.days.map((d) => [
        (d.day as Date).toISOString().slice(0, 10),
        d.units as number,
      ]),
    );
    expect(byDay.get('2026-11-11')).toBe(24);
    expect(byDay.get('2026-11-12')).toBe(32);
    expect(byDay.get('2026-11-13')).toBe(24);
    // The windows the counts were read with, per day, never overlap.
    const ws = [
      ...new Map(fx.windows!.map((w) => [w.gte.getTime(), w])).values(),
    ].sort((a, b) => a.gte.getTime() - b.gte.getTime());
    for (let i = 1; i < ws.length; i++) {
      expect(ws[i].gte.getTime()).toBe(ws[i - 1].lt.getTime());
    }
  });

  it('the deploy before the last old run: that day is counted once, the same way', async () => {
    const { fx, stored, job, svc } = world();
    await svc.computeDay('2026-11-10');
    // Deploy on the 12th at 01:00 UTC — the old 02:15 run of the 11th
    // never happens; the new run counts it with its UTC window.
    stored['admin.report_timezone'] = 'America/Los_Angeles';
    await job.run(at('2026-11-12T10:15:00Z'));
    await job.run(at('2026-11-13T10:15:00Z'));
    const byDay = new Map(
      fx.days.map((d) => [
        (d.day as Date).toISOString().slice(0, 10),
        d.units as number,
      ]),
    );
    expect(byDay.get('2026-11-11')).toBe(24);
    expect(byDay.get('2026-11-12')).toBe(32);
    expect(fx.accruals).toHaveLength(3);
  });

  it('a day already PAID before the switch is never recounted differently', async () => {
    const { fx, stored, job, svc } = world();
    await svc.computeDay('2026-11-11');
    fx.accruals[0].status = 'paid';
    stored['admin.report_timezone'] = 'America/Los_Angeles';
    const out = await job.run(at('2026-11-12T10:15:00Z'));
    expect(out).toMatchObject({ day: '2026-11-11', paidDiffs: 0 });
    expect(fx.accruals).toHaveLength(1);
  });

  it('the owner recounts only a finished day of the new schedule', async () => {
    const { stored, svc, job } = world();
    stored['admin.report_timezone'] = 'America/Los_Angeles';
    await job.run(at('2026-11-12T05:00:00Z')); // the first run sees the zone
    jest.useFakeTimers().setSystemTime(at('2026-11-13T07:00:00Z'));
    try {
      // the 12th is the switch day: it ends at Nevada midnight (08:00 UTC)
      await expect(svc.rerun(OWNER, A1, '2026-11-12')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      jest.setSystemTime(at('2026-11-13T08:30:00Z'));
      await expect(svc.rerun(OWNER, A1, '2026-11-12')).resolves.toMatchObject({
        day: '2026-11-12',
      });
    } finally {
      jest.useRealTimers();
    }
  });
});
