import type { AddressInfo, Server } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { totpCode } from '../src/modules/admin-auth/totp.util';
import { StaffPieceworkService } from '../src/modules/staff-piecework/staff-piecework.service';
import { adminSession, type AdminSession } from './support/admin-login';

/**
 * Staff package T7: piecework pay in the real API. The owner sets rates
 * (fresh 2FA code, audited, 404 for everyone else); the nightly count turns
 * yesterday's closed items into day rows and ONE payroll accrual per
 * person; the read side is scoped (owner: everyone with rates, head:
 * workspace totals only, worker: own days); a day can be held ("disputed")
 * and recounted by the owner. With `staff.piecework_enabled` off everything
 * answers 404.
 */
jest.setTimeout(180_000);

describe('Staff piecework (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let svc: StaffPieceworkService;
  let base = '';

  let owner: AdminSession;
  /** A second owner session that never steps up (the 403 checks). */
  let ownerNoStepUp: AdminSession;
  let head: AdminSession;
  let worker: AdminSession;
  let other: AdminSession;
  let employeeId = '';

  const yesterday = new Date(Date.now() - 86_400_000)
    .toISOString()
    .slice(0, 10);
  const noon = new Date(`${yesterday}T12:00:00Z`);
  const month = yesterday.slice(0, 7);

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
    prisma = app.get(PrismaService);
    redis = app.get<Redis>(REDIS_CLIENT);
    svc = app.get(StaffPieceworkService);

    await prisma.adminProfile.updateMany({
      where: { is_workspace_head: true },
      data: { is_workspace_head: false },
    });
    owner = await adminSession(base, prisma, 'super_admin');
    ownerNoStepUp = await adminSession(base, prisma, 'super_admin');
    head = await adminSession(base, prisma, 'support', undefined, {
      support: 'manage',
    });
    worker = await adminSession(base, prisma, 'support', undefined, {
      support: 'manage',
    });
    other = await adminSession(base, prisma, 'support', undefined, {
      support: 'manage',
    });
    await prisma.adminProfile.update({
      where: { user_id: head.userId },
      data: { workspace: 'mass', is_workspace_head: true },
    });
  });

  afterAll(async () => {
    await setSwitch(false);
    const ids = [owner, head, worker, other].map((s) => s.userId);
    await prisma.staffRatingSnapshot.deleteMany({
      where: { admin_id: { in: ids } },
    });
    await prisma.staffPieceworkDay.deleteMany({
      where: { admin_id: { in: ids } },
    });
    await prisma.workLeaseEvent.deleteMany({
      where: { admin_id: { in: ids } },
    });
    await prisma.staffDailyStat.deleteMany({
      where: { admin_id: { in: ids } },
    });
    await prisma.staffRate.deleteMany({ where: { created_by: owner.userId } });
    if (employeeId) {
      await prisma.payrollAccrual.deleteMany({
        where: { employee_id: employeeId },
      });
      await prisma.payrollEmployee.delete({ where: { id: employeeId } });
    }
    await prisma.adminProfile.update({
      where: { user_id: head.userId },
      data: { is_workspace_head: false },
    });
    await app.close();
  });

  const api = () => request(base);

  async function setSwitch(on: boolean) {
    await prisma.appConfig.upsert({
      where: { key: 'staff.piecework_enabled' },
      create: { key: 'staff.piecework_enabled', value: on },
      update: { value: on },
    });
    await redis.del('config:app_config'); // bypass the cache
  }

  /** Steps up (valid 5 min). A repeat inside the same 30 s code window is
   * refused as a replay — the earlier step-up is then still valid. */
  async function stepUp(a: AdminSession) {
    await api()
      .post('/api/v1/admin/auth/step-up')
      .set(a.auth)
      .send({ code: totpCode(a.totpSecret, Date.now() + 30_000) });
  }

  const get = (a: AdminSession, path: string) =>
    api().get(`/api/v1${path}`).set(a.auth);

  it('off (the default): rates and pay answer 404 to everyone, owner included', async () => {
    await setSwitch(false);
    await get(owner, '/admin/staff/rates').expect(404);
    await get(owner, `/admin/staff/piecework?period=${month}`).expect(404);
    await get(worker, `/admin/workspace/piecework?period=${month}`).expect(404);
    await get(head, `/admin/workspace/piecework?period=${month}`).expect(404);
  });

  it("on: rates CRUD is the owner's — 2FA step-up, audit row; a head gets 404", async () => {
    await setSwitch(true);
    const body = { kind: 'media_report', workspace: 'mass', amountCents: 150 };
    await get(head, '/admin/staff/rates').expect(404);
    await api()
      .put('/api/v1/admin/staff/rates')
      .set(head.auth)
      .send(body)
      .expect(404);
    await api()
      .put('/api/v1/admin/staff/rates')
      .set(ownerNoStepUp.auth)
      .send(body)
      .expect(403);

    await stepUp(owner);
    const set = await api()
      .put('/api/v1/admin/staff/rates')
      .set(owner.auth)
      .send(body)
      .expect(200);
    expect(set.body.data).toMatchObject({
      kind: 'media_report',
      amountCents: 150,
      currency: 'usd',
      active: true,
    });
    const list = await get(owner, '/admin/staff/rates').expect(200);
    expect(
      (list.body.data as Array<{ id: string }>).some(
        (r) => r.id === set.body.data.id,
      ),
    ).toBe(true);

    // a bad amount / kind is refused
    await api()
      .put('/api/v1/admin/staff/rates')
      .set(owner.auth)
      .send({ ...body, amountCents: 0 })
      .expect(400);
    await api()
      .put('/api/v1/admin/staff/rates')
      .set(owner.auth)
      .send({ ...body, kind: 'salary' })
      .expect(400);

    await stepUp(owner);
    await api()
      .delete(`/api/v1/admin/staff/rates/${set.body.data.id}`)
      .set(owner.auth)
      .expect(200);
    const audit = await prisma.auditLog.findMany({
      where: {
        admin_id: owner.userId,
        action: { in: ['staff.rate_set', 'staff.rate_end'] },
      },
    });
    expect(audit.map((a) => a.action).sort()).toEqual([
      'staff.rate_end',
      'staff.rate_set',
    ]);
  });

  it("the night count: yesterday's closed items -> day rows + ONE pending payroll accrual (idempotent)", async () => {
    // A rate that was already in force yesterday, the worker on payroll,
    // three closed tickets and a rating of 92 (×1.10).
    await prisma.staffRate.create({
      data: {
        kind: 'ticket',
        workspace: 'mass',
        amount_cents: 200,
        valid_from: new Date('2026-01-01T00:00:00Z'),
        created_by: owner.userId,
      },
    });
    const emp = await prisma.payrollEmployee.create({
      data: {
        admin_user_id: worker.userId,
        name: 'E2E Worker',
        role_title: 'Support',
        amount_cents: 0,
      },
    });
    employeeId = emp.id;
    for (let i = 0; i < 3; i++) {
      await prisma.workLeaseEvent.create({
        data: {
          kind: 'support_ticket',
          item_id: crypto.randomUUID(),
          admin_id: worker.userId,
          event: 'done',
          created_at: noon,
        },
      });
    }
    await prisma.staffDailyStat.create({
      data: {
        admin_id: worker.userId,
        day: new Date(`${yesterday}T00:00:00Z`),
        workspace: 'mass',
        decided: 3,
      },
    });
    await prisma.staffRatingSnapshot.create({
      data: {
        admin_id: worker.userId,
        snapshot_date: new Date(`${yesterday}T00:00:00Z`),
        workspace: 'mass',
        rating: 92,
        n_decisions: 40,
        status: 'green',
      },
    });

    const res = await svc.computeDay(yesterday);
    expect(res.accrued).toBeGreaterThanOrEqual(1);

    const days = await prisma.staffPieceworkDay.findMany({
      where: { admin_id: worker.userId },
    });
    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({
      kind: 'ticket',
      units: 3,
      rate_cents: 200,
      amount_cents: 660,
      status: 'accrued',
    });
    expect(Number(days[0].quality_mult)).toBe(1.1);

    const ref = `staff_piecework:${worker.userId}:${yesterday}`;
    const acc = await prisma.payrollAccrual.findMany({
      where: { employee_id: employeeId },
    });
    expect(acc).toHaveLength(1);
    expect(acc[0]).toMatchObject({
      event_ref: ref,
      amount_cents: 660,
      status: 'pending',
      source: 'admin',
    });

    await svc.computeDay(yesterday); // the cron fires twice
    expect(
      await prisma.payrollAccrual.count({ where: { employee_id: employeeId } }),
    ).toBe(1);
  });

  it('the read side is scoped: owner everything with rates, head totals only, worker own days', async () => {
    const q = `?period=${month}`;
    const ownerView = await get(owner, `/admin/staff/piecework${q}`).expect(
      200,
    );
    const mine = (
      ownerView.body.data.people as Array<{
        adminId: string;
        days: Array<{ kinds: unknown[] }>;
      }>
    ).find((p) => p.adminId === worker.userId);
    expect(mine?.days[0].kinds).toEqual([
      expect.objectContaining({
        kind: 'ticket',
        rateCents: 200,
        amountCents: 660,
      }),
    ]);

    // Only staff.piecework_enabled is on here (workspaces/head switches off,
    // so the guard's own workspaceHead flag is false): the head is read from
    // admin_profiles, the piecework view does not need the other switches.
    const headView = await get(head, `/admin/workspace/piecework${q}`).expect(
      200,
    );
    expect(headView.body.data.scope).toBe('head');
    expect(JSON.stringify(headView.body.data)).not.toContain('rateCents');
    const seen = (
      headView.body.data.people as Array<{
        adminId: string;
        amountCents: number | null;
        days: unknown[];
      }>
    ).find((p) => p.adminId === worker.userId);
    expect(seen).toMatchObject({ amountCents: null, days: [] });

    const own = await get(worker, `/admin/workspace/piecework${q}`).expect(200);
    expect(own.body.data.scope).toBe('self');
    expect(own.body.data.people).toHaveLength(1);
    expect(own.body.data.people[0]).toMatchObject({
      adminId: worker.userId,
      amountCents: 660,
    });
    expect(JSON.stringify(own.body.data)).not.toContain('rateCents');

    const none = await get(other, `/admin/workspace/piecework${q}`).expect(200);
    expect(JSON.stringify(none.body.data)).not.toContain(worker.userId);

    // the owner's routes do not exist for a head or a worker
    await get(head, `/admin/staff/piecework${q}`).expect(404);
    await get(worker, `/admin/staff/piecework${q}`).expect(404);
    await api()
      .post(
        `/api/v1/admin/staff/piecework/${worker.userId}/${yesterday}/dispute`,
      )
      .set(worker.auth)
      .send({ reason: 'хочу больше' })
      .expect(404);
  });

  it('dispute holds the day (accrual canceled); rerun lifts it and accrues again; both audited', async () => {
    const path = `/api/v1/admin/staff/piecework/${worker.userId}/${yesterday}`;
    await api()
      .post(`${path}/dispute`)
      .set(ownerNoStepUp.auth)
      .send({ reason: 'проверить' })
      .expect(403);

    await stepUp(owner);
    const held = await api()
      .post(`${path}/dispute`)
      .set(owner.auth)
      .send({ reason: 'проверить жалобу' })
      .expect(200);
    expect(held.body.data).toEqual({ status: 'disputed', accrual: 'canceled' });
    const ref = `staff_piecework:${worker.userId}:${yesterday}`;
    expect(
      (await prisma.payrollAccrual.findUnique({ where: { event_ref: ref } }))
        ?.status,
    ).toBe('canceled');
    const view = await get(
      owner,
      `/admin/staff/piecework?period=${month}`,
    ).expect(200);
    expect(
      (
        view.body.data.people as Array<{
          adminId: string;
          days: Array<{ status: string }>;
        }>
      ).find((p) => p.adminId === worker.userId)?.days[0].status,
    ).toBe('disputed');

    // the night run leaves it
    const night = await svc.computeDay(yesterday);
    expect(night.skippedDisputed).toBeGreaterThanOrEqual(1);

    await stepUp(owner);
    const again = await api().post(`${path}/rerun`).set(owner.auth).expect(200);
    expect(again.body.data).toMatchObject({ day: yesterday, admins: 1 });
    expect(
      (
        await prisma.payrollAccrual.findUnique({
          where: { event_ref: `${ref}:r2` },
        })
      )?.status,
    ).toBe('pending');

    const audit = await prisma.auditLog.findMany({
      where: {
        admin_id: owner.userId,
        action: { in: ['staff.piecework_dispute', 'staff.piecework_rerun'] },
      },
    });
    expect(audit.map((a) => a.action).sort()).toEqual([
      'staff.piecework_dispute',
      'staff.piecework_rerun',
    ]);
  });
});
