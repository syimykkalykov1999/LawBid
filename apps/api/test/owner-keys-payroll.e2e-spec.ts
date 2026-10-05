import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SecretsService } from '../src/common/secrets/secrets.service';
import { totpCode } from '../src/modules/admin-auth/totp.util';
import { FeatureFlagsService } from '../src/modules/feature-flags/services/feature-flags.service';
import { adminSession, type AdminSession } from './support/admin-login';

/**
 * Owner 2026-10-05:
 *  - several keys per service: the API uses the first enabled working set
 *    and falls back to the next; services can be added from the admin;
 *  - Деньги → Зарплаты: fixed monthly amounts, bulk «Выплатить» once per
 *    period, cancel with a reason, Stripe Connect payouts behind a flag;
 *  - rights: a section without the right answers 404; the trusted deputy
 *    reads money and runs payroll.
 */
jest.setTimeout(120_000);

describe('Key sets + payroll (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let secrets: SecretsService;
  let flags: FeatureFlagsService;
  let base = '';
  const period = `e2e-${randomUUID().slice(0, 8)}`;

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
    secrets = app.get(SecretsService);
    flags = app.get(FeatureFlagsService);
    // Payroll's Stripe part must use the dev stand-in, never real keys.
    await prisma.integrationCredential.deleteMany({
      where: { provider: 'stripe' },
    });
  });

  afterAll(async () => {
    await setStripeFlag(false);
    await app.close();
  });

  const api = () => request(base);

  async function stepUp(a: AdminSession) {
    await api()
      .post('/api/v1/admin/auth/step-up')
      .set(a.auth)
      .send({ code: totpCode(a.totpSecret, Date.now() + 30_000) })
      .expect(200);
  }

  async function setStripeFlag(enabled: boolean) {
    await prisma.featureFlag.upsert({
      where: { key: 'payroll_stripe_payouts' },
      update: { enabled },
      create: {
        key: 'payroll_stripe_payouts',
        enabled,
        rollout_percent: 100,
        description: 'e2e',
      },
    });
    await flags.invalidate();
  }

  it('several key sets: order, on/off, fallback, custom service', async () => {
    const admin = await adminSession(base, prisma, 'super_admin');
    await stepUp(admin);
    const id = `e2e_${randomUUID().slice(0, 8)}`;
    const provider = `custom_${id}`;
    await api()
      .post('/api/v1/admin/integrations/custom')
      .set(admin.auth)
      .send({
        id,
        label: 'E2E registry',
        fields: [
          { name: 'apiKey', label: 'API key', secret: true, required: true },
          { name: 'region', label: 'Region', secret: false, required: false },
        ],
      })
      .expect(201);

    const save = async (slot: string, key: string, label?: string) => {
      const r = await api()
        .post(`/api/v1/admin/integrations/${provider}/versions`)
        .set(admin.auth)
        .send({ values: { apiKey: key, region: 'us' }, slot, label })
        .expect(201);
      const v = (r.body as { data: { version: number } }).data.version;
      await api()
        .post(`/api/v1/admin/integrations/${provider}/versions/${v}/activate`)
        .set(admin.auth)
        .send({ force: true })
        .expect(200);
    };
    await save('main', 'first-key-aaaa-0001');
    await save('backup', 'second-key-bbbb-0002', 'Free account');

    expect((await secrets.get(provider))?.fields.apiKey).toBe(
      'first-key-aaaa-0001',
    );
    expect(
      (await secrets.getAll(provider)).map((c) => c.fields.apiKey),
    ).toEqual(['first-key-aaaa-0001', 'second-key-bbbb-0002']);

    // Fallback: the first set fails, the call goes through on the second.
    const used: string[] = [];
    const out = await secrets.withFallback(provider, (c) => {
      used.push(c.fields.apiKey);
      if (c.fields.apiKey.startsWith('first')) {
        return Promise.reject(new Error('quota exceeded'));
      }
      return Promise.resolve('ok');
    });
    expect(out).toBe('ok');
    expect(used).toEqual(['first-key-aaaa-0001', 'second-key-bbbb-0002']);
    // The failed set is skipped for a while.
    expect((await secrets.get(provider))?.fields.apiKey).toBe(
      'second-key-bbbb-0002',
    );

    // Off: skipped; then the order puts the backup first.
    await api()
      .patch(`/api/v1/admin/integrations/${provider}/slots/backup`)
      .set(admin.auth)
      .send({ enabled: false })
      .expect(200);
    expect(
      (await secrets.getAll(provider)).map((c) => c.fields.apiKey),
    ).toEqual(['first-key-aaaa-0001']);
    await api()
      .patch(`/api/v1/admin/integrations/${provider}/slots/backup`)
      .set(admin.auth)
      .send({ enabled: true })
      .expect(200);
    await api()
      .put(`/api/v1/admin/integrations/${provider}/order`)
      .set(admin.auth)
      .send({ slots: ['backup', 'main'] })
      .expect(200);

    const overview = await api()
      .get('/api/v1/admin/integrations')
      .set(admin.auth)
      .expect(200);
    const item = (
      overview.body as {
        data: {
          items: {
            provider: string;
            custom: boolean;
            slots: { slot: string; label: string | null }[];
          }[];
        };
      }
    ).data.items.find((i) => i.provider === provider)!;
    expect(item.custom).toBe(true);
    expect(item.slots.map((s) => s.slot)).toEqual(['backup', 'main']);
    expect(item.slots[0].label).toBe('Free account');
    // Never the whole key, only the mask.
    expect(JSON.stringify(overview.body)).not.toContain('second-key-bbbb-0002');

    // One set removed: the other keeps working.
    await api()
      .delete(`/api/v1/admin/integrations/${provider}`)
      .set(admin.auth)
      .send({ confirm: provider, slot: 'backup' })
      .expect(204);
    expect(
      (await secrets.getAll(provider)).map((c) => c.fields.apiKey),
    ).toEqual(['first-key-aaaa-0001']);

    await api()
      .delete(`/api/v1/admin/integrations/custom/${provider}`)
      .set(admin.auth)
      .send({ confirm: provider })
      .expect(204);
    expect(await secrets.get(provider)).toBeNull();
  });

  it('payroll: rights, bulk pay once per period, cancel, summary, audit', async () => {
    const finance = await adminSession(base, prisma, 'finance');
    const support = await adminSession(base, prisma, 'support');
    const viewer = await adminSession(base, prisma, 'finance', undefined, {
      payroll: 'view',
    });
    const deputy = await adminSession(base, prisma, 'support', undefined, {
      support: 'manage',
      manage_admins: true,
    });

    // No right: the section looks absent (404), and the try is audited.
    await api()
      .get('/api/v1/admin/payroll/employees')
      .set(support.auth)
      .expect(404);
    const denied = await prisma.auditLog.findFirst({
      where: { admin_id: support.userId, action: 'admin.access_denied' },
    });
    expect(denied).not.toBeNull();

    const add = async (name: string, amountCents: number) =>
      (
        (
          await api()
            .post('/api/v1/admin/payroll/employees')
            .set(finance.auth)
            .send({ name, amountCents, roleTitle: 'Moderator' })
            .expect(201)
        ).body as { data: { id: string } }
      ).data.id;
    const a = await add(`Ann ${period}`, 250_000);
    const b = await add(`Bob ${period}`, 180_000);

    // View-only cannot pay; the deputy reads money and pays.
    await api()
      .get('/api/v1/admin/payroll/employees')
      .set(viewer.auth)
      .expect(200);
    await api()
      .post('/api/v1/admin/payroll/payouts/bulk')
      .set(viewer.auth)
      .send({ employeeIds: [a], period })
      .expect(404);
    await api()
      .get('/api/v1/admin/billing/payments')
      .set(deputy.auth)
      .expect(200);

    const paid = await api()
      .post('/api/v1/admin/payroll/payouts/bulk')
      .set(deputy.auth)
      .send({
        employeeIds: [a, b],
        period,
        method: 'zelle',
        amounts: { [b]: 200_000 },
      })
      .expect(200);
    expect(paid.body.data).toMatchObject({
      count: 2,
      totals: { usd: 450_000 },
      alreadyPaid: [],
      failed: [],
    });

    // Paid once per period: a repeat pays nobody.
    const again = await api()
      .post('/api/v1/admin/payroll/payouts/bulk')
      .set(finance.auth)
      .send({ employeeIds: [a, b], period });
    expect(again.status).toBe(409);

    const summary = await api()
      .get('/api/v1/admin/payroll/summary')
      .query({ period })
      .set(finance.auth)
      .expect(200);
    expect(summary.body.data.paid.usd).toBe(450_000);

    const list = await api()
      .get('/api/v1/admin/payroll/payouts')
      .query({ period })
      .set(finance.auth)
      .expect(200);
    const rows = list.body.data as { id: string; employeeId: string }[];
    expect(rows).toHaveLength(2);
    const bobRow = rows.find((r) => r.employeeId === b)!;
    await api()
      .post(`/api/v1/admin/payroll/payouts/${bobRow.id}/cancel`)
      .set(finance.auth)
      .send({ reason: 'short' })
      .expect(400);
    await api()
      .post(`/api/v1/admin/payroll/payouts/${bobRow.id}/cancel`)
      .set(finance.auth)
      .send({ reason: 'Paid twice by mistake' })
      .expect(200);
    // After the cancel Bob can be paid for the period again.
    const bobAgain = await api()
      .post('/api/v1/admin/payroll/payouts/bulk')
      .set(finance.auth)
      .send({ employeeIds: [a, b], period })
      .expect(200);
    expect(bobAgain.body.data).toMatchObject({ count: 1, alreadyPaid: [a] });

    // Money views and every write are in the audit log.
    const audit = await prisma.auditLog.findMany({
      where: {
        action: {
          in: ['payroll.pay_bulk', 'payroll.payout_cancel', 'admin.view'],
        },
        admin_id: { in: [finance.userId, deputy.userId] },
      },
    });
    expect(audit.map((r) => r.action)).toEqual(
      expect.arrayContaining([
        'payroll.pay_bulk',
        'payroll.payout_cancel',
        'admin.view',
      ]),
    );
  });

  it('payroll via Stripe Connect: off by default, link, transfer, failure', async () => {
    const finance = await adminSession(base, prisma, 'finance');
    const sPeriod = `${period}-s`;
    const add = async (name: string, email: string) =>
      (
        (
          await api()
            .post('/api/v1/admin/payroll/employees')
            .set(finance.auth)
            .send({ name, amountCents: 100_000, email })
            .expect(201)
        ).body as { data: { id: string } }
      ).data.id;
    const ok = await add(`Stripe ok ${period}`, 'ok@lawbid-e2e.test');
    const bad = await add(`Stripe fail ${period}`, 'fail@lawbid-e2e.test');

    await setStripeFlag(false);
    await api()
      .post('/api/v1/admin/payroll/payouts/bulk')
      .set(finance.auth)
      .send({ employeeIds: [ok], period: sPeriod, method: 'stripe' })
      .expect(409);

    await setStripeFlag(true);
    // Not linked yet.
    await api()
      .post('/api/v1/admin/payroll/payouts/bulk')
      .set(finance.auth)
      .send({ employeeIds: [ok], period: sPeriod, method: 'stripe' })
      .expect(400);
    for (const id of [ok, bad]) {
      const link = await api()
        .post(`/api/v1/admin/payroll/employees/${id}/stripe-link`)
        .set(finance.auth)
        .expect(200);
      expect(link.body.data.url).toMatch(/^https:\/\//);
      expect(link.body.data.payoutsEnabled).toBe(true);
    }
    const r = await api()
      .post('/api/v1/admin/payroll/payouts/bulk')
      .set(finance.auth)
      .send({ employeeIds: [ok, bad], period: sPeriod, method: 'stripe' })
      .expect(200);
    expect(r.body.data).toMatchObject({ count: 1, failed: [bad] });
    const rows = await prisma.payrollPayout.findMany({
      where: { period: sPeriod },
    });
    const okRow = rows.find((x) => x.employee_id === ok)!;
    expect(okRow).toMatchObject({ status: 'paid', method: 'stripe' });
    expect(okRow.transfer_id).toMatch(/^tr_/);
    expect(rows.find((x) => x.employee_id === bad)?.status).toBe('failed');

    // A Stripe payment is reversed on cancel.
    await api()
      .post(`/api/v1/admin/payroll/payouts/${okRow.id}/cancel`)
      .set(finance.auth)
      .send({ reason: 'Wrong person selected' })
      .expect(200);
    await setStripeFlag(false);
  });
});
