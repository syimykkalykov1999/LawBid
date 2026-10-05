import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { ReferralsService } from '../src/modules/referrals/referrals.service';
import { OUTREACH_EMAIL } from '../src/modules/outreach/outreach.service';
import { defaultPermissionsForRole } from '../src/modules/admin-auth/admin-permissions';
import type { EmailMessage } from '../src/modules/auth/providers/email/email-provider.interface';
import { adminSession } from './support/admin-login';

/**
 * Owner 2026-10-05: outreach (CRM) for cold calls and emails. The owner
 * imports a lead list (CSV / a free state registry), hands leads to
 * employees (admins who are partners), each employee calls or emails with
 * their own partner link, and the owner sees who works and who does not;
 * a lead that signs up with the link turns `registered`, and `paid` when
 * the partner commission accrues.
 */
jest.setTimeout(120_000);

describe('Outreach (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let referrals: ReferralsService;
  let base = '';
  const sent: EmailMessage[] = [];
  const REASON = 'Cold outreach pilot, October';
  const tag = randomUUID().replace(/-/g, '').slice(0, 6).toLowerCase();
  // Unique, valid US numbers / emails for this run.
  const n = Date.now() % 10_000_000;
  const phone = (i: number) => `1212${String(n + i).padStart(7, '0')}`;
  const email = (i: number) => `lead${i}.${tag}@example.com`;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(OUTREACH_EMAIL)
      .useValue({
        sendEmail: (m: EmailMessage) => {
          sent.push(m);
          return Promise.resolve();
        },
      })
      .compile();
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
    tokens = app.get(TokenService);
    referrals = app.get(ReferralsService);
    await prisma.appConfig.deleteMany({
      where: {
        key: {
          in: ['referrals.program', 'partners.program', 'outreach.program'],
        },
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(base);

  function auth(id: string, role: 'client' | 'attorney') {
    const t = tokens.signAccessToken({
      sub: id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    });
    return { Authorization: `Bearer ${t}` };
  }

  it('owner imports leads, an employee works them with their link, the owner sees the results', async () => {
    const owner = await adminSession(base, prisma, 'super_admin');
    // An employee: a support admin with the outreach toggle who is also a
    // partner (that is what makes their leads and link theirs).
    const emp = await adminSession(base, prisma, 'support', undefined, {
      ...defaultPermissionsForRole('support'),
      outreach: 'manage',
    });
    await prisma.user.update({
      where: { id: emp.userId },
      data: { first_name: 'Olga', last_name: 'Sales' },
    });
    const code = `EMP${tag.toUpperCase()}`;
    const partnerRes = await api()
      .post('/api/v1/admin/partners')
      .set(owner.auth)
      .send({
        userId: emp.userId,
        label: 'Olga (sales)',
        code,
        attorneyRateCents: 5_000,
        clientRateCents: 1_000,
        holdDays: 0,
        reason: REASON,
      })
      .expect(201);
    const partnerId = partnerRes.body.data.id as string;

    // Context: the owner manages, the employee is scoped to themself.
    const ownerCtx = await api()
      .get('/api/v1/admin/outreach/context')
      .set(owner.auth)
      .expect(200);
    expect(ownerCtx.body.data.manager).toBe(true);
    expect(ownerCtx.body.data.scope).toBeNull();
    expect(
      (ownerCtx.body.data.partners as { id: string }[]).map((p) => p.id),
    ).toContain(partnerId);
    const empCtx = await api()
      .get('/api/v1/admin/outreach/context')
      .set(emp.auth)
      .expect(200);
    expect(empCtx.body.data.manager).toBe(false);
    expect(empCtx.body.data.scope.id).toBe(partnerId);

    // CAN-SPAM settings (super admin only).
    await api()
      .put('/api/v1/admin/outreach/settings')
      .set(emp.auth)
      .send({
        dailyEmailLimit: 2,
        fromName: 'LawBid',
        footerAddress: '1106 N Plum Grove Rd, Schaumburg IL 60173',
        apiPublicUrl: 'https://api.lawbid.test',
      })
      .expect(403);
    await api()
      .put('/api/v1/admin/outreach/settings')
      .set(owner.auth)
      .send({
        dailyEmailLimit: 2,
        fromName: 'LawBid',
        footerAddress: '1106 N Plum Grove Rd, Schaumburg IL 60173',
        apiPublicUrl: 'https://api.lawbid.test/',
      })
      .expect(200);

    // CSV import: dry-run first, then apply; a second apply finds duplicates.
    const csv = [
      'Имя,Фамилия,Фирма,Штат,Телефон,Email',
      `Ivan,Petrov,Petrov Law,New York,${phone(1)},${email(1).toUpperCase()}`,
      `Anna,Lee,Lee & Co,ca,${phone(2)},${email(2)}`,
      'No,Contact,Nothing,TX,,',
    ].join('\n');
    const dry = await api()
      .post('/api/v1/admin/outreach/leads/import?kind=attorney')
      .set(owner.auth)
      .attach('file', Buffer.from(csv), 'leads.csv')
      .expect(201);
    expect(dry.body.data).toMatchObject({
      mode: 'dry-run',
      rows: 2,
      created: 2,
      duplicates: 0,
      skipped: 1,
    });
    expect(
      await prisma.outreachLead.count({ where: { email: email(1) } }),
    ).toBe(0);
    const applied = await api()
      .post('/api/v1/admin/outreach/leads/import?kind=attorney&mode=apply')
      .set(owner.auth)
      .attach('file', Buffer.from(csv), 'leads.csv')
      .expect(201);
    expect(applied.body.data).toMatchObject({ mode: 'apply', created: 2 });
    const again = await api()
      .post('/api/v1/admin/outreach/leads/import?kind=attorney&mode=apply')
      .set(owner.auth)
      .attach('file', Buffer.from(csv), 'leads.csv')
      .expect(201);
    expect(again.body.data).toMatchObject({ created: 0, duplicates: 2 });
    // A file without contacts is refused; an employee may not import.
    await api()
      .post('/api/v1/admin/outreach/leads/import?mode=apply')
      .set(owner.auth)
      .attach('file', Buffer.from('name,city\nA,B\n'), 'x.csv')
      .expect(400);
    await api()
      .post('/api/v1/admin/outreach/leads/import?mode=apply')
      .set(emp.auth)
      .attach('file', Buffer.from(csv), 'leads.csv')
      .expect(403);

    const ivan = await prisma.outreachLead.findUniqueOrThrow({
      where: { email: email(1) },
    });
    const anna = await prisma.outreachLead.findUniqueOrThrow({
      where: { email: email(2) },
    });
    expect(ivan).toMatchObject({
      kind: 'attorney',
      state_code: 'NY',
      phone: phone(1),
      source: 'csv',
      status: 'new',
      partner_id: null,
    });

    // The owner sees both; the employee sees nothing until assigned.
    const ownerList = await api()
      .get(`/api/v1/admin/outreach/leads?q=${tag}`)
      .set(owner.auth)
      .expect(200);
    expect(ownerList.body.data).toHaveLength(2);
    const empEmpty = await api()
      .get(`/api/v1/admin/outreach/leads?q=${tag}`)
      .set(emp.auth)
      .expect(200);
    expect(empEmpty.body.data).toHaveLength(0);
    await api()
      .get(`/api/v1/admin/outreach/leads/${ivan.id}`)
      .set(emp.auth)
      .expect(404);

    // Assign Ivan to the employee (bulk; employees may not assign).
    await api()
      .post('/api/v1/admin/outreach/leads/assign')
      .set(emp.auth)
      .send({ leadIds: [ivan.id], partnerId })
      .expect(403);
    const assigned = await api()
      .post('/api/v1/admin/outreach/leads/assign')
      .set(owner.auth)
      .send({ leadIds: [ivan.id], partnerId })
      .expect(200);
    expect(assigned.body.data).toEqual({ updated: 1 });
    const empList = await api()
      .get(`/api/v1/admin/outreach/leads?q=${tag}`)
      .set(emp.auth)
      .expect(200);
    expect(empList.body.data).toHaveLength(1);
    expect(empList.body.data[0].id).toBe(ivan.id);

    // A call: no answer → working; interested → replied. Never backwards.
    const call1 = await api()
      .post(`/api/v1/admin/outreach/leads/${ivan.id}/activities`)
      .set(emp.auth)
      .send({ kind: 'call', outcome: 'no_answer' })
      .expect(201);
    expect(call1.body.data.status).toBe('working');
    await api()
      .post(`/api/v1/admin/outreach/leads/${ivan.id}/activities`)
      .set(emp.auth)
      .send({ kind: 'call' }) // a call needs an outcome
      .expect(400);
    const call2 = await api()
      .post(`/api/v1/admin/outreach/leads/${ivan.id}/activities`)
      .set(emp.auth)
      .send({
        kind: 'call',
        outcome: 'interested',
        body: 'Wants the link by email',
        nextActionAt: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .expect(201);
    expect(call2.body.data.status).toBe('replied');
    expect(call2.body.data.activities.length).toBeGreaterThanOrEqual(3);

    // A template with the link; the employee emails Ivan with THEIR link.
    const tpl = await api()
      .post('/api/v1/admin/outreach/templates')
      .set(owner.auth)
      .send({
        name: 'Attorney intro',
        kind: 'attorney',
        subject: 'Hello {{first_name}}, clients are waiting on LawBid',
        body: 'Hi {{first_name}},\n\nJoin here: {{link}}\n\n{{sender_name}}',
      })
      .expect(201);
    const templateId = tpl.body.data.id as string;
    const mail = await api()
      .post(`/api/v1/admin/outreach/leads/${ivan.id}/email`)
      .set(emp.auth)
      .send({ templateId })
      .expect(200);
    expect(mail.body.data.subject).toBe(
      'Hello Ivan, clients are waiting on LawBid',
    );
    expect(mail.body.data.remainingToday).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(email(1));
    expect(sent[0].text).toContain(code); // the employee's partner link
    expect(sent[0].text).toContain('Olga Sales');
    expect(sent[0].text).toContain(
      `https://api.lawbid.test/api/v1/outreach/unsubscribe/${ivan.unsubscribe_token}`,
    );
    expect(sent[0].text).toContain('Schaumburg');
    const afterMail = await prisma.outreachLead.findUniqueOrThrow({
      where: { id: ivan.id },
    });
    expect(afterMail.status).toBe('replied'); // contacted < replied: stays

    // Unsubscribe is public and final.
    const unsub = await api()
      .get(`/api/v1/outreach/unsubscribe/${ivan.unsubscribe_token}`)
      .expect(200);
    expect(unsub.headers['content-type']).toContain('text/html');
    await api().get('/api/v1/outreach/unsubscribe/nope').expect(404);
    await api()
      .post(`/api/v1/admin/outreach/leads/${ivan.id}/email`)
      .set(emp.auth)
      .send({ templateId })
      .expect(409);

    // Daily budget: the owner hands Anna to the employee, who emails her;
    // the third email of the day is refused. (Employees reach only their
    // own leads: an unassigned one is 404 for them, see above.)
    await api()
      .post(`/api/v1/admin/outreach/leads/${anna.id}/email`)
      .set(emp.auth)
      .send({ templateId })
      .expect(404);
    await api()
      .post('/api/v1/admin/outreach/leads/assign')
      .set(owner.auth)
      .send({ leadIds: [anna.id], partnerId })
      .expect(200);
    await api()
      .post(`/api/v1/admin/outreach/leads/${anna.id}/email`)
      .set(emp.auth)
      .send({ templateId })
      .expect(200);
    expect(
      (await prisma.outreachLead.findUniqueOrThrow({ where: { id: anna.id } }))
        .partner_id,
    ).toBe(partnerId);
    const third = await prisma.outreachLead.create({
      data: {
        kind: 'attorney',
        first_name: 'Third',
        email: email(3),
        source: 'manual',
        partner_id: partnerId,
        created_by: owner.userId,
        unsubscribe_token: `t${tag}${randomUUID().replace(/-/g, '')}`.slice(
          0,
          40,
        ),
      },
    });
    const limited = await api()
      .post(`/api/v1/admin/outreach/leads/${third.id}/email`)
      .set(emp.auth)
      .send({ templateId })
      .expect(429);
    expect(limited.body.error.code).toBe('OUTREACH_EMAIL_LIMIT');

    // Conversion: Anna signs up with the employee's code → registered;
    // her first paid invoice → commission → paid.
    const annaUser = await prisma.user.create({
      data: {
        role: 'attorney',
        first_name: 'Anna',
        last_name: 'Lee',
        status: 'active',
        email: email(2),
        email_verified_at: new Date(),
      },
    });
    await api()
      .post('/api/v1/referrals/apply')
      .set(auth(annaUser.id, 'attorney'))
      .send({ code })
      .expect(200);
    let annaLead = await prisma.outreachLead.findUniqueOrThrow({
      where: { id: anna.id },
    });
    expect(annaLead.status).toBe('registered');
    expect(annaLead.converted_user_id).toBe(annaUser.id);
    await referrals.onQualifyingEvent(annaUser.id, 'subscription_payment');
    annaLead = await prisma.outreachLead.findUniqueOrThrow({
      where: { id: anna.id },
    });
    expect(annaLead.status).toBe('paid');
    // A paid lead is never moved back by a call outcome.
    const late = await api()
      .post(`/api/v1/admin/outreach/leads/${anna.id}/activities`)
      .set(emp.auth)
      .send({ kind: 'call', outcome: 'not_interested' })
      .expect(201);
    expect(late.body.data.status).toBe('paid');

    // The owner's dashboard: who works and what it brought.
    const stats = await api()
      .get('/api/v1/admin/outreach/stats')
      .set(owner.auth)
      .expect(200);
    const row = (
      stats.body.data.partners as {
        partner: { id: string } | null;
        leads: number;
        calls: number;
        emails: number;
        registered: number;
        paid: number;
        commissionCents: number;
      }[]
    ).find((p) => p.partner?.id === partnerId);
    expect(row).toBeDefined();
    expect(row!.leads).toBe(3);
    expect(row!.calls).toBe(3);
    expect(row!.emails).toBe(2);
    expect(row!.registered).toBe(1);
    expect(row!.paid).toBe(1);
    expect(row!.commissionCents).toBe(5_000);
    expect(stats.body.data.byStatus.paid).toBeGreaterThanOrEqual(1);
    // The employee sees only their own row.
    const empStats = await api()
      .get('/api/v1/admin/outreach/stats')
      .set(emp.auth)
      .expect(200);
    expect(empStats.body.data.partners).toHaveLength(1);

    // Manual edit and CSV export.
    const edited = await api()
      .patch(`/api/v1/admin/outreach/leads/${ivan.id}`)
      .set(emp.auth)
      .send({ practice: 'family', status: 'lost' })
      .expect(200);
    expect(edited.body.data).toMatchObject({
      practice: 'family',
      status: 'lost',
    });
    await api()
      .patch(`/api/v1/admin/outreach/leads/${anna.id}`)
      .set(owner.auth)
      .send({ status: 'registered' }) // system statuses cannot be set by hand
      .expect(409);
    const exported = await api()
      .get(`/api/v1/admin/outreach/leads/export.csv?q=${tag}`)
      .set(owner.auth)
      .expect(200);
    expect(exported.headers['content-type']).toContain('text/csv');
    expect(exported.text).toContain(email(2));
  });

  it('an admin without the outreach toggle is refused', async () => {
    const mod = await adminSession(base, prisma, 'moderator');
    await api().get('/api/v1/admin/outreach/leads').set(mod.auth).expect(403);
    await api()
      .post('/api/v1/admin/outreach/leads')
      .set(mod.auth)
      .send({ kind: 'attorney', email: email(9) })
      .expect(403);
  });
});
