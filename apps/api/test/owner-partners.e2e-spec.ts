import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { ReferralsService } from '../src/modules/referrals/referrals.service';
import { PartnersService } from '../src/modules/partners/partners.service';
import { adminSession, adminStepUp } from './support/admin-login';

/**
 * Owner 2026-10-05: partner (affiliate) program. A partner's code binds the
 * people who enter it; the owner pays per attorney who bought a
 * subscription and per client who hired, after an anti-fraud hold; the
 * partner sees who joined and what was earned; the admin approves, pays,
 * reverses and exports.
 */
jest.setTimeout(120_000);

describe('Partner program (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let referrals: ReferralsService;
  let partners: PartnersService;
  let base = '';
  const REASON = 'Blogger deal signed in October';
  const tag = randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();

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
    tokens = app.get(TokenService);
    referrals = app.get(ReferralsService);
    partners = app.get(PartnersService);
    // The friends' referral program stays OFF: a partner code must work
    // regardless.
    await prisma.appConfig.deleteMany({
      where: { key: { in: ['referrals.program', 'partners.program'] } },
    });
    // Owner 2026-10-14: the partner program is off by default; these suites
    // exercise it, so they switch it on.
    await prisma.appConfig.upsert({
      where: { key: 'partners.program' },
      create: { key: 'partners.program', value: { enabled: true } },
      update: { value: { enabled: true } },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(base);
  const JOIN = { termsAccepted: true };

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

  const user = (role: 'attorney' | 'client', first: string) =>
    prisma.user.create({
      data: { role, first_name: first, last_name: 'Partner', status: 'active' },
    });

  it('nobody is a partner by default', async () => {
    const u = await user('client', 'Nobody');
    const res = await api()
      .get('/api/v1/partners/me')
      .set(auth(u.id, 'client'))
      .expect(200);
    expect(res.body.data.isPartner).toBe(false);
    expect(res.body.data.referred).toEqual([]);
  });

  it('admin makes a blogger a partner with own rates; attorney pays → held → approved → paid; client hires → accrual; reject → reversal; CSV', async () => {
    const admin = await adminSession(base, prisma, 'super_admin');
    const blogger = await user('client', 'Blogger');
    const code = `BLOG${tag}`;

    // Create with own rates and a vanity code.
    const created = await api()
      .post('/api/v1/admin/partners')
      .set(admin.auth)
      .send({
        userId: blogger.id,
        label: 'Blogger Ivan',
        code,
        attorneyRateCents: 7_000,
        clientRateCents: 1_500,
        monthlyBaseCents: 0,
        holdDays: 0,
        // Owner 2026-10-05 (legal): the program default is case_published
        // (never the hire); this partner knowingly pays on the hire.
        clientRule: 'bid_accepted',
        reason: REASON,
      })
      .expect(201);
    const partnerId = created.body.data.id as string;
    expect(created.body.data.code).toBe(code);
    expect(created.body.data.rates.attorneyRateCents).toBe(7_000);
    expect(created.body.data.rates.clientRule).toBe('bid_accepted');
    expect(created.body.data.w9ReceivedAt).toBeNull();
    expect(created.body.data.termsAcceptedAt).toBeNull();
    // Twice is refused.
    await api()
      .post('/api/v1/admin/partners')
      .set(admin.auth)
      .send({ userId: blogger.id, reason: REASON })
      .expect(409);

    // The blogger sees the program with their link.
    const me0 = await api()
      .get('/api/v1/partners/me')
      .set(auth(blogger.id, 'client'))
      .expect(200);
    expect(me0.body.data.isPartner).toBe(true);
    expect(me0.body.data.code).toBe(code);
    expect(me0.body.data.shareUrl).toContain(code);
    expect(me0.body.data.totals.referredCount).toBe(0);

    // An attorney joins by the code (referral program is OFF: still works).
    const att = await user('attorney', 'Referred');
    await api()
      .post('/api/v1/referrals/apply')
      .set(auth(att.id, 'attorney'))
      .send({ code })
      .expect(200);
    // Self-use is refused.
    await api()
      .post('/api/v1/referrals/apply')
      .set(auth(blogger.id, 'client'))
      .send({ code })
      .expect(409);

    // Joined, nothing earned yet: a trial or a sign-up pays nothing.
    const me1 = await api()
      .get('/api/v1/partners/me')
      .set(auth(blogger.id, 'client'))
      .expect(200);
    expect(me1.body.data.totals.referredCount).toBe(1);
    expect(me1.body.data.referred[0]).toMatchObject({
      role: 'attorney',
      status: 'joined',
      amountCents: 0,
    });
    expect(me1.body.data.referred[0].name).toBe('Referred P.');

    // The first paid invoice → commission (holdDays 0 → approved at once).
    await referrals.onQualifyingEvent(att.id, 'subscription_payment');
    await referrals.onQualifyingEvent(att.id, 'subscription_payment'); // idempotent
    const me2 = await api()
      .get('/api/v1/partners/me')
      .set(auth(blogger.id, 'client'))
      .expect(200);
    expect(me2.body.data.totals.approvedCents).toBe(7_000);
    expect(me2.body.data.commissions).toHaveLength(1);
    expect(me2.body.data.referred[0].status).toBe('qualified');
    expect(
      await prisma.notification.count({
        where: { user_id: blogger.id, type: 'partner_commission' },
      }),
    ).toBe(1);

    // Admin detail shows the same.
    const detail = await api()
      .get(`/api/v1/admin/partners/${partnerId}`)
      .set(admin.auth)
      .expect(200);
    expect(detail.body.data.partner.totals.approvedCents).toBe(7_000);
    expect(detail.body.data.referred[0].email).toBeNull();
    const attCommission = detail.body.data.commissions[0].id as string;

    // Owner 2026-10-22: marking money paid needs a fresh step-up (and a
    // second admin from the dual-approval limit on; 70 USD is below it).
    await adminStepUp(base, admin);
    // Owner 2026-10-05 (legal): no payout before the W-9 is on file.
    await api()
      .post(`/api/v1/admin/partners/${partnerId}/pay`)
      .set(admin.auth)
      .send({ reason: REASON, payoutRef: 'ACH-0001' })
      .expect(409);
    const w9 = await api()
      .patch(`/api/v1/admin/partners/${partnerId}`)
      .set(admin.auth)
      .send({ w9Received: true, reason: REASON })
      .expect(200);
    expect(w9.body.data.w9ReceivedAt).not.toBeNull();
    // The partner has not accepted the rules yet: the app shows them.
    const meTerms = await api()
      .get('/api/v1/partners/me')
      .set(auth(blogger.id, 'client'))
      .expect(200);
    expect(meTerms.body.data.termsAcceptedVersion).toBeNull();
    expect(meTerms.body.data.w9Received).toBe(true);
    expect(meTerms.body.data.texts.terms).toContain('W-9');
    const accepted = await api()
      .post('/api/v1/partners/me/accept-terms')
      .set(auth(blogger.id, 'client'))
      .expect(200);
    expect(accepted.body.data.termsAcceptedVersion).toBe(
      accepted.body.data.termsVersion,
    );

    // Pay everything approved.
    const paid = await api()
      .post(`/api/v1/admin/partners/${partnerId}/pay`)
      .set(admin.auth)
      .send({ reason: REASON, payoutRef: 'ACH-0001' })
      .expect(200);
    expect(paid.body.data).toEqual({ count: 1, totalCents: 7_000 });
    // Nothing left → 409.
    await api()
      .post(`/api/v1/admin/partners/${partnerId}/pay`)
      .set(admin.auth)
      .send({ reason: REASON })
      .expect(409);
    expect(
      await prisma.notification.count({
        where: { user_id: blogger.id, type: 'partner_payout' },
      }),
    ).toBe(1);
    const me3 = await api()
      .get('/api/v1/partners/me')
      .set(auth(blogger.id, 'client'))
      .expect(200);
    expect(me3.body.data.totals.paidCents).toBe(7_000);
    expect(me3.body.data.referred[0].status).toBe('paid');

    // Reversing a paid commission adds a deduction instead.
    await api()
      .post(`/api/v1/admin/partners/commissions/${attCommission}/reverse`)
      .set(admin.auth)
      .send({ reason: 'Chargeback from the attorney' })
      .expect(200);
    const afterReverse = await api()
      .get(`/api/v1/admin/partners/${partnerId}`)
      .set(admin.auth)
      .expect(200);
    expect(afterReverse.body.data.partner.totals.approvedCents).toBe(-7_000);

    // A client: publishing a case is not enough (rule = bid_accepted).
    await api()
      .patch(`/api/v1/admin/partners/${partnerId}`)
      .set(admin.auth)
      .send({ holdDays: 14, reason: REASON })
      .expect(200);
    const client = await user('client', 'Hiring');
    await api()
      .post('/api/v1/referrals/apply')
      .set(auth(client.id, 'client'))
      .send({ code })
      .expect(200);
    await referrals.onQualifyingEvent(client.id, 'case_published');
    expect(
      await prisma.partnerCommission.count({
        where: { referred_user_id: client.id },
      }),
    ).toBe(0);
    await referrals.onQualifyingEvent(client.id, 'bid_accepted');
    const clientCommission = await prisma.partnerCommission.findFirstOrThrow({
      where: { referred_user_id: client.id },
    });
    expect(clientCommission).toMatchObject({
      kind: 'client_qualified',
      amount_cents: 1_500,
      status: 'held',
    });
    expect(clientCommission.hold_until).not.toBeNull();

    // The sweep does not release it before the hold ends...
    const early = await partners.release(new Date());
    expect(early.approved).toBe(0);
    // ...and does after.
    const later = new Date(Date.now() + 15 * 86_400_000);
    const sweep = await partners.release(later);
    expect(sweep.approved).toBe(1);

    // The admin rejects the client's referral as fraud → reversed.
    const referral = await prisma.referral.findUniqueOrThrow({
      where: { referee_id: client.id },
    });
    await api()
      .post(`/api/v1/admin/referrals/${referral.id}/reject`)
      .set(admin.auth)
      .send({ reason: 'Fake account farm' })
      .expect(200);
    const reversed = await prisma.partnerCommission.findUniqueOrThrow({
      where: { id: clientCommission.id },
    });
    expect(reversed.status).toBe('reversed');

    // Lists, stats and CSV.
    const list = await api()
      .get('/api/v1/admin/partners?q=Ivan')
      .set(admin.auth)
      .expect(200);
    expect((list.body.data as { id: string }[]).map((p) => p.id)).toContain(
      partnerId,
    );
    const commissions = await api()
      .get(`/api/v1/admin/partners/commissions?partnerId=${partnerId}`)
      .set(admin.auth)
      .expect(200);
    expect(commissions.body.data).toHaveLength(3); // paid, deduction, reversed
    const stats = await api()
      .get('/api/v1/admin/partners/stats')
      .set(admin.auth)
      .expect(200);
    expect(stats.body.data.partners).toBeGreaterThanOrEqual(1);
    const csv = await api()
      .get(
        `/api/v1/admin/partners/commissions/export.csv?partnerId=${partnerId}`,
      )
      .set(admin.auth)
      .expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text.split('\n')[0]).toContain('amount_cents');
    expect(csv.text).toContain('attorney_subscription');

    // Ending the partner stops new accruals.
    await api()
      .patch(`/api/v1/admin/partners/${partnerId}`)
      .set(admin.auth)
      .send({ status: 'ended', reason: REASON })
      .expect(200);
    const late = await user('attorney', 'Late');
    await api()
      .post('/api/v1/referrals/apply')
      .set(auth(late.id, 'attorney'))
      .send({ code })
      .expect(403); // program off and the partner ended
  });

  it('attorneys and clients join by themselves; the master switch hides the program and stops attribution', async () => {
    const admin = await adminSession(base, prisma, 'super_admin');
    const self = await user('attorney', 'Selfmade');

    // Not a partner yet, but may join; the program rates are shown.
    const before = await api()
      .get('/api/v1/partners/me')
      .set(auth(self.id, 'attorney'))
      .expect(200);
    expect(before.body.data).toMatchObject({
      enabled: true,
      isPartner: false,
      canJoin: true,
    });
    expect(before.body.data.rates.attorneyRateCents).toBe(5_000);

    // Owner 2026-10-05 (legal): the rules must be accepted to join.
    await api()
      .post('/api/v1/partners/me/join')
      .set(auth(self.id, 'attorney'))
      .send({ termsAccepted: false })
      .expect(400);
    const joined = await api()
      .post('/api/v1/partners/me/join')
      .set(auth(self.id, 'attorney'))
      .send(JOIN)
      .expect(200);
    expect(joined.body.data.isPartner).toBe(true);
    expect(joined.body.data.termsAcceptedVersion).toBe(
      joined.body.data.termsVersion,
    );
    expect(
      await prisma.partner.findUniqueOrThrow({ where: { user_id: self.id } }),
    ).toMatchObject({ terms_version: joined.body.data.termsVersion });
    expect(joined.body.data.canJoin).toBe(false);
    const selfCode = joined.body.data.code as string;
    expect(selfCode).toMatch(/^[A-Z0-9]{4,24}$/);
    expect(joined.body.data.shareUrl).toContain(selfCode);
    // Twice is refused; the admin sees the new partner.
    await api()
      .post('/api/v1/partners/me/join')
      .set(auth(self.id, 'attorney'))
      .send(JOIN)
      .expect(409);
    const list = await api()
      .get('/api/v1/admin/partners?q=Selfmade')
      .set(admin.auth)
      .expect(200);
    expect(list.body.data).toHaveLength(1);

    // Approval mode: a request waits; the code attributes nobody until the
    // admin approves, then the person is told and the link works.
    const settings = (
      await api().get('/api/v1/admin/partners/settings').set(admin.auth)
    ).body.data;
    await api()
      .put('/api/v1/admin/partners/settings')
      .set(admin.auth)
      .send({ ...settings, joinMode: 'approval' })
      .expect(200);
    const applicant = await user('client', 'Applicant');
    const asked = await api()
      .post('/api/v1/partners/me/join')
      .set(auth(applicant.id, 'client'))
      .send(JOIN)
      .expect(200);
    expect(asked.body.data).toMatchObject({
      isPartner: true,
      status: 'pending',
      joinMode: 'approval',
    });
    const applicantCode = asked.body.data.code as string;
    const friend = await user('attorney', 'Friend');
    await api()
      .post('/api/v1/referrals/apply')
      .set(auth(friend.id, 'attorney'))
      .send({ code: applicantCode })
      .expect(403); // pending: not a partner yet, friends' program off
    const pendingStats = await api()
      .get('/api/v1/admin/partners/stats')
      .set(admin.auth)
      .expect(200);
    expect(pendingStats.body.data.pending).toBeGreaterThanOrEqual(1);
    const pendingRows = await api()
      .get('/api/v1/admin/partners?status=pending&q=Applicant')
      .set(admin.auth)
      .expect(200);
    expect(pendingRows.body.data).toHaveLength(1);
    await api()
      .patch(`/api/v1/admin/partners/${pendingRows.body.data[0].id}`)
      .set(admin.auth)
      .send({ status: 'active', reason: REASON })
      .expect(200);
    expect(
      await prisma.notification.count({
        where: { user_id: applicant.id, type: 'partner_approved' },
      }),
    ).toBe(1);
    await api()
      .post('/api/v1/referrals/apply')
      .set(auth(friend.id, 'attorney'))
      .send({ code: applicantCode })
      .expect(200);

    // Closed: the next person cannot join; partners keep working.
    await api()
      .put('/api/v1/admin/partners/settings')
      .set(admin.auth)
      .send({ ...settings, joinMode: 'closed' })
      .expect(200);
    const other = await user('client', 'Latecomer');
    const otherMe = await api()
      .get('/api/v1/partners/me')
      .set(auth(other.id, 'client'))
      .expect(200);
    expect(otherMe.body.data.canJoin).toBe(false);
    await api()
      .post('/api/v1/partners/me/join')
      .set(auth(other.id, 'client'))
      .send(JOIN)
      .expect(403);

    // Master switch off: the section disappears for everyone and the code
    // attributes nobody (the friends' program is off too → 403).
    await api()
      .put('/api/v1/admin/partners/settings')
      .set(admin.auth)
      .send({ ...settings, enabled: false })
      .expect(200);
    const hidden = await api()
      .get('/api/v1/partners/me')
      .set(auth(self.id, 'attorney'))
      .expect(200);
    expect(hidden.body.data.enabled).toBe(false);
    expect(hidden.body.data.isPartner).toBe(true); // data kept, UI hidden
    await api()
      .post('/api/v1/referrals/apply')
      .set(auth(other.id, 'client'))
      .send({ code: selfCode })
      .expect(403);
    await api()
      .post('/api/v1/partners/me/join')
      .set(auth(other.id, 'client'))
      .send(JOIN)
      .expect(403);

    // Back on: joining works again.
    await api()
      .put('/api/v1/admin/partners/settings')
      .set(admin.auth)
      .send({ ...settings, enabled: true, joinMode: 'open' })
      .expect(200);
    await api()
      .post('/api/v1/partners/me/join')
      .set(auth(other.id, 'client'))
      .send(JOIN)
      .expect(200);
  });

  it('partners are a money area: only the super admin reaches them', async () => {
    // Same rule as referrals and billing (admin-permissions SUPER_ONLY_AREAS):
    // support and finance are refused whatever their toggles say — and the
    // section answers as if it didn't exist (owner 2026-10-05: 404).
    for (const role of ['support', 'finance', 'moderator'] as const) {
      const s = await adminSession(base, prisma, role);
      await api().get('/api/v1/admin/partners').set(s.auth).expect(404);
      await api()
        .post('/api/v1/admin/partners')
        .set(s.auth)
        .send({ userId: randomUUID(), reason: REASON })
        .expect(404);
    }
  });
});
