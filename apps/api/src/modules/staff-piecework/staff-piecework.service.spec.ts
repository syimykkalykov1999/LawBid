import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  A1,
  A2,
  DAY,
  DAY_START,
  OWNER,
  done,
  emptyFx,
  makeService,
  rate,
  withPerson,
  type Fx,
} from '../../../test/support/staff-piecework-fixtures';

const REF = `staff_piecework:${A1}:${DAY}`;

/** A typical day: 10 tickets + 2 verifications, 1 ticket overturned. */
function typicalDay(): Fx {
  const fx = emptyFx();
  withPerson(fx, A1);
  fx.rates.push(rate('ticket', 200), rate('verification', 500));
  fx.leaseDone.push(
    ...done(A1, 'support_ticket', 10),
    ...done(A1, 'verification', 2),
  );
  fx.overturned.push({ decided_by: A1, decision_kind: 'support_ticket', n: 1 });
  fx.snapshots.push({ admin_id: A1, rating: 92, status: 'green' });
  return fx;
}

describe('StaffPieceworkService.computeDay', () => {
  it('units x rate x quality, overturned not paid -> day rows + ONE accrual', async () => {
    const fx = typicalDay();
    const { svc } = makeService(fx);
    const res = await svc.computeDay(DAY);

    const ticket = fx.days.find((d) => d.kind === 'ticket');
    expect(ticket).toMatchObject({
      units: 10,
      held_units: 1,
      rate_cents: 200,
      quality_mult: '1.10',
      amount_cents: 1980, // (10 - 1) x 200 x 1.10
      accrual_ref: REF,
      status: 'accrued',
    });
    expect(fx.days.find((d) => d.kind === 'verification')).toMatchObject({
      units: 2,
      held_units: 0,
      amount_cents: 1100,
    });
    expect(fx.accruals).toHaveLength(1);
    expect(fx.accruals[0]).toMatchObject({
      event_ref: REF,
      amount_cents: 3080,
      kind: 'bonus',
      source: 'admin',
      period: '2026-10',
      status: 'pending',
      currency: 'usd',
    });
    expect(res).toMatchObject({ admins: 1, accrued: 1, totalCents: 3080 });
  });

  it.each([
    [95, '1.10', 1100],
    [80, '1.00', 1000],
    [65, '0.90', 900],
    [40, '0.75', 750],
  ])('rating %i -> coefficient %s', async (rating, mult, cents) => {
    const fx = emptyFx();
    withPerson(fx, A1);
    fx.rates.push(rate('ticket', 100));
    fx.leaseDone.push(...done(A1, 'support_ticket', 10));
    fx.snapshots.push({ admin_id: A1, rating, status: 'ok' });
    await makeService(fx).svc.computeDay(DAY);
    expect(fx.days[0]).toMatchObject({
      quality_mult: mult,
      amount_cents: cents,
    });
  });

  it('low_data counts at ×1.00 without the «без рейтинга» mark', async () => {
    const fx = emptyFx();
    withPerson(fx, A1);
    fx.rates.push(rate('ticket', 100));
    fx.leaseDone.push(...done(A1, 'support_ticket', 4));
    fx.snapshots.push({ admin_id: A1, rating: null, status: 'low_data' });
    const res = await makeService(fx).svc.computeDay(DAY);
    expect(fx.days[0]).toMatchObject({
      quality_mult: '1.00',
      amount_cents: 400,
      status: 'accrued',
    });
    expect(res.noRating).toBe(0);
  });

  it('no rating snapshot yet: ×1.00 and the day is marked «без рейтинга»', async () => {
    const fx = typicalDay();
    fx.snapshots = [];
    const res = await makeService(fx).svc.computeDay(DAY);
    expect(fx.days[0]).toMatchObject({
      quality_mult: '1.00',
      status: 'no_rating',
    });
    expect(fx.accruals[0].amount_cents).toBe(2800); // 9 x 200 + 2 x 500
    expect(res.noRating).toBe(1);
  });

  it('uses the owner coefficients from the settings', async () => {
    const fx = typicalDay();
    await makeService(fx, {
      'staff.piecework_enabled': true,
      'staff.piecework.mult_90_pct': 120,
    }).svc.computeDay(DAY);
    expect(fx.days[0].quality_mult).toBe('1.20');
  });

  it('a double run is one accrual (idempotent) and the same rows', async () => {
    const fx = typicalDay();
    const { svc } = makeService(fx);
    await svc.computeDay(DAY);
    const again = await svc.computeDay(DAY);
    expect(fx.accruals).toHaveLength(1);
    expect(fx.days).toHaveLength(2);
    expect(again).toMatchObject({ accrued: 0, totalCents: 0 });
  });

  it('reversal: more overturned than done is a negative adjustment', async () => {
    const fx = emptyFx();
    withPerson(fx, A1);
    fx.rates.push(rate('ticket', 200));
    fx.stats = []; // the person is named only by the overturned verdicts
    fx.overturned.push({
      decided_by: A1,
      decision_kind: 'support_ticket',
      n: 2,
    });
    fx.snapshots.push({ admin_id: A1, rating: 80, status: 'ok' });
    await makeService(fx).svc.computeDay(DAY);
    expect(fx.days[0]).toMatchObject({
      units: 0,
      held_units: 2,
      amount_cents: -400,
      status: 'reversed',
    });
    expect(fx.accruals[0]).toMatchObject({
      amount_cents: -400,
      kind: 'adjustment',
    });
  });

  it('no rate for a kind: the units are recorded, nothing is paid', async () => {
    const fx = typicalDay();
    fx.rates = [];
    await makeService(fx).svc.computeDay(DAY);
    expect(fx.days.map((d) => d.amount_cents as number)).toEqual([0, 0]);
    expect(fx.accruals).toHaveLength(0);
  });

  it('a rate of another workspace or one that ended is not used', async () => {
    const fx = typicalDay();
    fx.rates = [
      rate('ticket', 999, { workspace: 'finance' }),
      rate('verification', 999, { valid_to: new Date('2026-10-10T00:00:00Z') }),
    ];
    await makeService(fx).svc.computeDay(DAY);
    expect(fx.accruals).toHaveLength(0);
  });

  it('not on payroll: the day is recorded, no accrual, counted as skipped', async () => {
    const fx = emptyFx();
    withPerson(fx, A1, { payroll: false });
    fx.rates.push(rate('ticket', 100));
    fx.leaseDone.push(...done(A1, 'support_ticket', 3));
    const res = await makeService(fx).svc.computeDay(DAY);
    expect(fx.days[0]).toMatchObject({
      amount_cents: 300,
      status: 'no_payroll',
      accrual_ref: null,
    });
    expect(fx.accruals).toHaveLength(0);
    expect(res.skippedNoPayroll).toBe(1);

    // They are put on payroll later: a recount accrues the day.
    fx.employees.push({
      id: 'e1',
      user_id: null,
      admin_user_id: A1,
      name: 'Late',
      currency: 'usd',
      active: true,
    });
    await makeService(fx).svc.computeDay(DAY);
    expect(fx.accruals).toHaveLength(1);
    expect(fx.days[0].status).not.toBe('no_payroll');
  });

  it('never creates a payroll entry for a staff member (no direct payroll writes)', async () => {
    const fx = emptyFx();
    withPerson(fx, A1, { payroll: false });
    fx.rates.push(rate('ticket', 100));
    fx.leaseDone.push(...done(A1, 'support_ticket', 3));
    await makeService(fx).svc.computeDay(DAY);
    expect(fx.employees).toHaveLength(0);
  });

  it('names the people from the lease events when the day has no stats yet', async () => {
    const fx = typicalDay();
    fx.stats = [];
    fx.overturned = [];
    const res = await makeService(fx).svc.computeDay(DAY);
    expect(res.admins).toBe(1);
    expect(fx.accruals).toHaveLength(1);
  });

  it('kinds that are not paid by the piece are ignored', async () => {
    const fx = emptyFx();
    withPerson(fx, A1);
    fx.rates.push(rate('ticket', 100));
    fx.leaseDone.push(...done(A1, 'refund', 5));
    await makeService(fx).svc.computeDay(DAY);
    expect(fx.days).toHaveLength(0);
    expect(fx.accruals).toHaveLength(0);
  });

  it('an empty recount never wipes a recorded day', async () => {
    const fx = typicalDay();
    const { svc } = makeService(fx);
    await svc.computeDay(DAY);
    fx.leaseDone = [];
    fx.overturned = [];
    await svc.computeDay(DAY);
    expect(fx.days).toHaveLength(2);
  });
});

describe('StaffPieceworkService recount', () => {
  it('a pending accrual whose amount changed is canceled and re-issued as :r2', async () => {
    const fx = typicalDay();
    const { svc } = makeService(fx);
    await svc.computeDay(DAY);
    fx.leaseDone.push(...done(A1, 'support_ticket', 5));
    await svc.computeDay(DAY);

    const old = fx.accruals.find((a) => a.event_ref === REF);
    const next = fx.accruals.find((a) => a.event_ref === `${REF}:r2`);
    expect(old).toMatchObject({ status: 'canceled' });
    expect(next).toMatchObject({ status: 'pending', amount_cents: 4180 });
    expect(fx.days.every((d) => d.accrual_ref === `${REF}:r2`)).toBe(true);
    expect(fx.accruals.filter((a) => a.status === 'pending')).toHaveLength(1);
  });

  it('an already PAID day is never rewritten: the difference is reported', async () => {
    const fx = typicalDay();
    const { svc } = makeService(fx);
    await svc.computeDay(DAY);
    fx.accruals[0].status = 'paid';
    fx.leaseDone.push(...done(A1, 'support_ticket', 5));
    const res = await svc.computeDay(DAY);
    expect(fx.accruals).toHaveLength(1);
    expect(fx.accruals[0]).toMatchObject({
      status: 'paid',
      amount_cents: 3080,
    });
    expect(res.paidDiffs).toEqual([{ adminId: A1, deltaCents: 1100 }]);
  });
});

describe('StaffPieceworkService dispute / rerun', () => {
  it('dispute cancels the pending accrual, marks the rows, is audited', async () => {
    const fx = typicalDay();
    const { svc, audit } = makeService(fx);
    await svc.computeDay(DAY);
    await expect(
      svc.dispute(OWNER, A1, DAY, 'проверить жалобу'),
    ).resolves.toEqual({ status: 'disputed', accrual: 'canceled' });
    expect(fx.accruals[0].status).toBe('canceled');
    expect(fx.days.every((d) => d.status === 'disputed')).toBe(true);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        adminId: OWNER.id,
        action: 'staff.piecework_dispute',
        targetId: A1,
      }),
      expect.anything(),
    );
  });

  it('the nightly run leaves a disputed day alone', async () => {
    const fx = typicalDay();
    const { svc } = makeService(fx);
    await svc.computeDay(DAY);
    await svc.dispute(OWNER, A1, DAY, 'держим');
    const res = await svc.computeDay(DAY);
    expect(res.skippedDisputed).toBe(1);
    expect(fx.days.every((d) => d.status === 'disputed')).toBe(true);
    expect(fx.accruals.filter((a) => a.status === 'pending')).toHaveLength(0);
  });

  it('rerun lifts the dispute and accrues the day again (audited)', async () => {
    const fx = typicalDay();
    const { svc, audit } = makeService(fx);
    await svc.computeDay(DAY);
    await svc.dispute(OWNER, A1, DAY, 'держим');
    const res = await svc.rerun(OWNER, A1, DAY);
    expect(res).toMatchObject({ admins: 1, accrued: 1 });
    expect(fx.days.every((d) => d.status === 'accrued')).toBe(true);
    const live = fx.accruals.filter((a) => a.status === 'pending');
    expect(live).toHaveLength(1);
    expect(live[0].event_ref).toBe(`${REF}:r2`);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'staff.piecework_rerun' }),
    );
  });

  it('dispute of an unknown day is 404; today cannot be recounted', async () => {
    const fx = typicalDay();
    const { svc } = makeService(fx);
    await expect(
      svc.dispute(OWNER, A2, DAY, 'нет такого'),
    ).rejects.toBeInstanceOf(NotFoundException);
    const today = new Date().toISOString().slice(0, 10);
    await expect(svc.rerun(OWNER, A1, today)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(svc.rerun(OWNER, A1, 'nonsense')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('dispute after the money went out reports it and holds the rows', async () => {
    const fx = typicalDay();
    const { svc } = makeService(fx);
    await svc.computeDay(DAY);
    fx.accruals[0].status = 'paid';
    await expect(svc.dispute(OWNER, A1, DAY, 'после выплаты')).resolves.toEqual(
      {
        status: 'disputed',
        accrual: 'paid',
      },
    );
    expect(fx.accruals[0].status).toBe('paid');
  });
});

describe('DAY_START fixture', () => {
  it('is the UTC midnight the rows are keyed by', () => {
    expect(DAY_START.toISOString()).toBe('2026-10-26T00:00:00.000Z');
  });
});
