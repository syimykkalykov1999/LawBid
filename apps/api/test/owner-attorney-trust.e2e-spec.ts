import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { TokenService } from '../src/modules/auth/services/token.service';
import { AttorneyTrustService } from '../src/modules/attorney-trust/attorney-trust.service';
import { adminSession } from './support/admin-login';

/**
 * Owner 2026-10-05: attorney trust levels. Registration stays one step
 * (self-attested bar number), but what an attorney may do grows with what
 * was confirmed: 0 self-declared, 1 registry match or staff license check,
 * 2 identity (Stripe KYC name match or firm link), 3 documents. Every
 * gate and every automatic action is an admin setting.
 */
jest.setTimeout(120_000);

describe('Attorney trust levels (e2e, owner 2026-10-05)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let tokens: TokenService;
  let trust: AttorneyTrustService;
  let base = '';
  let practiceAreaId = '';
  const REASON = 'Trust levels e2e';

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
    tokens = app.get(TokenService);
    trust = app.get(AttorneyTrustService);
    const area = await prisma.practiceArea.upsert({
      where: { code: 'e2e_trust_leaf' },
      create: {
        code: 'e2e_trust_leaf',
        name_en: 'E2E trust',
        i18n_key: 'practice.e2e_trust_leaf',
        sort: 1,
      },
      update: {},
    });
    practiceAreaId = area.id;
    await resetSettings();
  });

  afterAll(async () => {
    await resetSettings();
    await app.close();
  });

  const api = () => request(base);

  async function resetSettings() {
    await prisma.appConfig.deleteMany({
      where: { key: { startsWith: 'trust.' } },
    });
    await redis.del('config:app_config');
  }

  async function setSetting(key: string, value: number | boolean) {
    await prisma.appConfig.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
    await redis.del('config:app_config'); // bypass the 30 s cache
  }

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

  async function client() {
    const u = await prisma.user.create({
      data: { role: 'client', first_name: 'Cl', last_name: 'Ient' },
    });
    return { id: u.id, auth: auth(u.id, 'client') };
  }

  /** A self-attested attorney: verified status + a verified license with
   * no registry result yet (the state has no registry) → level 0. */
  async function attorney(
    opts: { registry?: 'pass' | 'fail'; state?: string } = {},
  ) {
    const u = await prisma.user.create({
      data: { role: 'attorney', first_name: 'Kim', last_name: 'Wexler' },
    });
    const username = `tr_${u.id.slice(0, 8)}`;
    await prisma.attorneyProfile.create({
      data: {
        user_id: u.id,
        username,
        username_lower: username,
        languages: ['en'],
        verification_status: 'verified',
      },
    });
    await prisma.subscription.create({
      data: { user_id: u.id, status: 'active', price_cents: 9900 },
    });
    await prisma.attorneyLicense.create({
      data: {
        attorney_id: u.id,
        state_code: opts.state ?? 'NJ',
        bar_number: `T-${randomUUID().slice(0, 12)}`,
        license_status: 'verified',
        auto_check_result: opts.registry
          ? {
              result: opts.registry,
              name: 'KIM WEXLER',
              lookupProvider: 'e2e',
            }
          : undefined,
        registry_flag: opts.registry === 'fail' ? 'not_found' : null,
      },
    });
    await prisma.attorneyPracticeArea.create({
      data: { attorney_id: u.id, practice_area_id: practiceAreaId },
    });
    return { id: u.id, auth: auth(u.id, 'attorney') };
  }

  async function kase(clientId: string): Promise<string> {
    const c = await prisma.case.create({
      data: {
        client_id: clientId,
        title: 'Speeding ticket in Trenton',
        description: 'Got a ticket on the turnpike last week driving home.',
        practice_area_id: practiceAreaId,
        primary_state_code: 'NJ',
        budget_mode: 'clarify_later',
        status: 'open',
      },
    });
    await prisma.caseState.create({
      data: { case_id: c.id, state_code: 'NJ', is_primary: true },
    });
    return c.id;
  }

  function bid(attorneyAuth: Record<string, string>, caseId: string) {
    return api()
      .post(`/api/v1/cases/${caseId}/bids`)
      .set(attorneyAuth)
      .set('Idempotency-Key', randomUUID())
      .send({
        feeType: 'fixed',
        amountCents: 50_000,
        message: 'Happy to help with this ticket, I can start right away.',
        startAvailability: 'immediately',
      });
  }

  it('a self-attested attorney is level 0: no badge, bids allowed, payments not', async () => {
    const a = await attorney();
    const me = await api().get('/api/v1/trust/me').set(a.auth).expect(200);
    expect(me.body.data).toMatchObject({
      level: 0,
      badge: false,
      canBid: true,
      acceptsPayments: false,
      signals: { selfAttested: true, licenseConfirmed: false },
    });
    expect(me.body.data.nextSteps).toContain('registry_check');
    // Mirrored on the profile for every list and card.
    const profile = await api()
      .get('/api/v1/attorneys/me/profile')
      .set(a.auth)
      .expect(200);
    expect(profile.body.data).toMatchObject({
      verifiedBadge: false,
      trustLevel: 0,
    });
    // The public card says what was checked and links to the registry.
    const pub = await api()
      .get(`/api/v1/trust/attorneys/${a.id}`)
      .set((await client()).auth)
      .expect(200);
    expect(pub.body.data.level).toBe(0);
    expect(pub.body.data.registryLinks[0]).toMatchObject({ stateCode: 'NJ' });
  });

  it('a registry match is level 1; staff documents + identity reach 3', async () => {
    const a = await attorney({ registry: 'pass' });
    const me = await api().get('/api/v1/trust/me').set(a.auth).expect(200);
    expect(me.body.data).toMatchObject({
      level: 1,
      signals: { licenseConfirmed: true, licenseConfirmedBy: 'registry' },
    });

    const admin = await adminSession(base, prisma, 'verifier');
    await api()
      .post(`/api/v1/admin/trust/attorneys/${a.id}/confirm-documents`)
      .set(admin.auth)
      .send({ note: REASON })
      .expect(200);
    // Documents alone do not prove the person at the keyboard is the
    // attorney paid through Stripe: identity (level 2) is still missing.
    const card1 = await api()
      .get(`/api/v1/admin/trust/attorneys/${a.id}`)
      .set(admin.auth)
      .expect(200);
    expect(card1.body.data.level).toBe(1);
    expect(card1.body.data.signals.documentsVerified).toBe(true);

    // Stripe KYC with a matching legal name → identity → level 3.
    await trust.onStripeAccount(a.id, {
      chargesEnabled: true,
      detailsSubmitted: true,
      businessType: 'individual',
      legalFirstName: 'Kim',
      legalLastName: 'Wexler',
    });
    const card2 = await api()
      .get(`/api/v1/admin/trust/attorneys/${a.id}`)
      .set(admin.auth)
      .expect(200);
    expect(card2.body.data).toMatchObject({
      level: 3,
      badge: true,
      signals: { stripeKyc: true, nameCheck: 'match' },
    });
    const kinds = (card2.body.data.events as { kind: string }[]).map(
      (e) => e.kind,
    );
    expect(kinds).toEqual(
      expect.arrayContaining([
        'documents_verified',
        'stripe_kyc',
        'level_changed',
      ]),
    );
    expect(
      await prisma.notification.count({
        where: { user_id: a.id, type: 'verification_update' },
      }),
    ).toBeGreaterThan(0);
  });

  it('Stripe legal name that differs from the profile pauses payments (auto, switchable)', async () => {
    const a = await attorney({ registry: 'pass' });
    await trust.onStripeAccount(a.id, {
      chargesEnabled: true,
      detailsSubmitted: true,
      businessType: 'individual',
      legalFirstName: 'Saul',
      legalLastName: 'Goodman',
    });
    const me = await api().get('/api/v1/trust/me').set(a.auth).expect(200);
    expect(me.body.data).toMatchObject({
      level: 1,
      signals: { nameCheck: 'mismatch' },
      paymentsGate: { allowed: false, reason: 'hold' },
    });
    expect(me.body.data.nextSteps).toContain('hold_review');

    // Off: the mismatch is only recorded.
    await setSetting('trust.auto_hold_on_name_mismatch', false);
    const b = await attorney({ registry: 'pass' });
    await trust.onStripeAccount(b.id, {
      chargesEnabled: true,
      detailsSubmitted: true,
      businessType: 'individual',
      legalFirstName: 'Saul',
      legalLastName: 'Goodman',
    });
    const meB = await api().get('/api/v1/trust/me').set(b.auth).expect(200);
    expect(meB.body.data.signals.nameCheck).toBe('mismatch');
    expect(meB.body.data.paymentsGate.reason).not.toBe('hold');
    await resetSettings();
  });

  it('a company Stripe account: the representative is compared, the firm link opens', async () => {
    const a = await attorney({ registry: 'pass' });
    // Owner: an LLC in Stripe is fine when the attorney is its
    // representative/owner; company.name is never compared with a person.
    await trust.onStripeAccount(a.id, {
      chargesEnabled: true,
      detailsSubmitted: true,
      businessType: 'company',
      companyName: 'Wexler Law LLC',
      companyUrl: 'https://wexlerlaw.com',
      people: [
        { firstName: 'Kim', lastName: 'Wexler', role: 'representative' },
      ],
    });
    const me = await api().get('/api/v1/trust/me').set(a.auth).expect(200);
    expect(me.body.data).toMatchObject({
      level: 2,
      signals: { nameCheck: 'match' },
      stripeBusinessType: 'company',
    });

    // Not the representative: payments wait for the firm link.
    const b = await attorney({ registry: 'pass' });
    await trust.onStripeAccount(b.id, {
      chargesEnabled: true,
      detailsSubmitted: true,
      businessType: 'company',
      companyName: 'Big Firm LLP',
      companyUrl: 'https://bigfirm.example.com',
      people: [{ firstName: 'Howard', lastName: 'Hamlin', role: 'owner' }],
    });
    const meB = await api().get('/api/v1/trust/me').set(b.auth).expect(200);
    expect(meB.body.data.level).toBe(1);
    expect(meB.body.data.firmLink.status).toBe('pending');
    expect(meB.body.data.nextSteps).toContain('firm_link');

    // A public mailbox is refused; an address on the firm's domain gets a code.
    await api()
      .post('/api/v1/trust/me/firm-email')
      .set(b.auth)
      .send({ email: 'kim@gmail.com' })
      .expect(400);
    const sent = await api()
      .post('/api/v1/trust/me/firm-email')
      .set(b.auth)
      .send({ email: 'kim@bigfirm.example.com' })
      .expect(200);
    expect(sent.body.data.domain).toBe('bigfirm.example.com');
    await api()
      .post('/api/v1/trust/me/firm-email/confirm')
      .set(b.auth)
      .send({ code: '000000' })
      .expect(400);
    const stored = await redis.get(`trust:firm-email:${b.id}`);
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored as string) as { code: string };
    await api()
      .post('/api/v1/trust/me/firm-email/confirm')
      .set(b.auth)
      .send({ code: parsed.code })
      .expect(200);
    const after = await api().get('/api/v1/trust/me').set(b.auth).expect(200);
    expect(after.body.data).toMatchObject({
      level: 2,
      firmLink: { status: 'confirmed', source: 'email' },
    });
  });

  it('the bid gate: raising the minimum level blocks level-0 attorneys with a clear code', async () => {
    const c = await client();
    const a = await attorney();
    const caseId = await kase(c.id);
    expect((await bid(a.auth, caseId)).status).toBe(201);

    await setSetting('trust.min_level_bids', 1);
    const caseId2 = await kase(c.id);
    const refused = await bid(a.auth, caseId2);
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe('TRUST_LEVEL_REQUIRED');
    expect(refused.body.error.details).toMatchObject({
      gate: 'bids',
      required: 1,
      current: 0,
    });
    // Level 1 passes the same gate.
    const ok = await attorney({ registry: 'pass' });
    expect((await bid(ok.auth, caseId2)).status).toBe(201);
    await resetSettings();
  });

  it('a fraud complaint from a client who dealt with the attorney pauses payments and bids; two → suspended', async () => {
    const a = await attorney({ registry: 'pass' });
    const c1 = await client();
    const stranger = await client();
    const caseId = await kase(c1.id);
    expect((await bid(a.auth, caseId)).status).toBe(201);

    // Somebody who never dealt with the attorney cannot hold them.
    await api()
      .post('/api/v1/reports')
      .set(stranger.auth)
      .send({ targetType: 'user', targetId: a.id, reason: 'fraud' })
      .expect(204);
    const untouched = await api()
      .get(`/api/v1/trust/attorneys/${a.id}`)
      .set(stranger.auth)
      .expect(200);
    expect(untouched.body.data.canBid).toBe(true);

    await api()
      .post('/api/v1/reports')
      .set(c1.auth)
      .send({ targetType: 'user', targetId: a.id, reason: 'fraud' })
      .expect(204);
    const held = await api().get('/api/v1/trust/me').set(a.auth).expect(200);
    expect(held.body.data).toMatchObject({
      canBid: false,
      bidsGate: { allowed: false, reason: 'hold' },
      paymentsGate: { allowed: false, reason: 'hold' },
    });
    const caseId2 = await kase(c1.id);
    const refused = await bid(a.auth, caseId2);
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe('ATTORNEY_ON_HOLD');

    // The admin sees the hold and lifts it after review.
    const admin = await adminSession(base, prisma, 'verifier');
    const holds = await api()
      .get('/api/v1/admin/trust/holds')
      .set(admin.auth)
      .expect(200);
    expect(
      (holds.body.data as { attorney: { id: string } }[]).map(
        (h) => h.attorney.id,
      ),
    ).toContain(a.id);
    await api()
      .post(`/api/v1/admin/trust/attorneys/${a.id}/release`)
      .set(admin.auth)
      .send({ note: 'Reviewed the chat: a payment dispute, not fraud' })
      .expect(200);
    const released = await api()
      .get('/api/v1/trust/me')
      .set(a.auth)
      .expect(200);
    expect(released.body.data.canBid).toBe(true);

    // A second distinct client inside the window → automatic suspension.
    const c2 = await client();
    const caseId3 = await kase(c2.id);
    expect((await bid(a.auth, caseId3)).status).toBe(201);
    await api()
      .post('/api/v1/reports')
      .set(c2.auth)
      .send({ targetType: 'user', targetId: a.id, reason: 'impersonation' })
      .expect(204);
    const profile = await prisma.attorneyProfile.findUniqueOrThrow({
      where: { user_id: a.id },
    });
    expect(profile.verification_status).toBe('suspended');
    const bids = await prisma.bid.findMany({
      where: { attorney_id: a.id, status: 'active' },
    });
    expect(bids).toHaveLength(0);
  });

  it('the complaint hold is a switch', async () => {
    await setSetting('trust.auto_hold_on_complaint', false);
    const a = await attorney({ registry: 'pass' });
    const c = await client();
    const caseId = await kase(c.id);
    expect((await bid(a.auth, caseId)).status).toBe(201);
    await api()
      .post('/api/v1/reports')
      .set(c.auth)
      .send({ targetType: 'user', targetId: a.id, reason: 'fraud' })
      .expect(204);
    const me = await api().get('/api/v1/trust/me').set(a.auth).expect(200);
    expect(me.body.data.canBid).toBe(true);
    await resetSettings();
  });

  it('a second claim of the same bar number flags the holder for the registry queue', async () => {
    const holder = await attorney({ registry: 'pass' });
    const claimant = await attorney();
    const license = await prisma.attorneyLicense.findFirstOrThrow({
      where: { attorney_id: holder.id },
    });
    await trust.onDuplicateClaim(
      holder.id,
      claimant.id,
      license.state_code,
      license.bar_number,
    );
    const flagged = await prisma.attorneyLicense.findUniqueOrThrow({
      where: { id: license.id },
    });
    expect(flagged.registry_flag).toBe('duplicate_claim');
    // The registry confirmation no longer counts until staff look.
    const me = await api().get('/api/v1/trust/me').set(holder.auth).expect(200);
    expect(me.body.data.level).toBe(0);
    const admin = await adminSession(base, prisma, 'verifier');
    const card = await api()
      .get(`/api/v1/admin/trust/attorneys/${holder.id}`)
      .set(admin.auth)
      .expect(200);
    expect(card.body.data.duplicateClaims).toBe(1);
    // Staff confirm the license by hand → level 1 again.
    await api()
      .post(`/api/v1/admin/trust/attorneys/${holder.id}/confirm-license`)
      .set(admin.auth)
      .send({ note: 'Called the NJ bar: the holder is the real one' })
      .expect(200);
    const back = await api()
      .get('/api/v1/trust/me')
      .set(holder.auth)
      .expect(200);
    expect(back.body.data).toMatchObject({
      level: 1,
      signals: { licenseConfirmedBy: 'staff' },
    });
  });

  it('settings: read, change, bounds, stats; a support admin is refused', async () => {
    const admin = await adminSession(base, prisma, 'super_admin');
    const before = await api()
      .get('/api/v1/admin/trust/settings')
      .set(admin.auth)
      .expect(200);
    expect(before.body.data).toMatchObject({
      minLevelBids: 0,
      minLevelPayments: 2,
      minLevelBadge: 2,
      payoutDelayDays: 7,
      autoHoldOnComplaint: true,
      complaintsToSuspend: 2,
    });
    const next = {
      ...(before.body.data as Record<string, unknown>),
      minLevelBadge: 1,
      payoutDelayDays: 14,
    };
    const saved = await api()
      .put('/api/v1/admin/trust/settings')
      .set(admin.auth)
      .send(next)
      .expect(200);
    expect(saved.body.data).toMatchObject({
      minLevelBadge: 1,
      payoutDelayDays: 14,
    });
    // A level-1 attorney now wears the badge.
    const a = await attorney({ registry: 'pass' });
    const pub = await api()
      .get(`/api/v1/trust/attorneys/${a.id}`)
      .set((await client()).auth)
      .expect(200);
    expect(pub.body.data).toMatchObject({ level: 1, badge: true });
    await api()
      .put('/api/v1/admin/trust/settings')
      .set(admin.auth)
      .send({ ...next, minLevelBids: 7 })
      .expect(400);
    const stats = await api()
      .get('/api/v1/admin/trust/stats')
      .set(admin.auth)
      .expect(200);
    expect(stats.body.data.byLevel).toEqual(
      expect.arrayContaining([expect.objectContaining({ level: 1 })]),
    );
    const support = await adminSession(base, prisma, 'support');
    await api()
      .get('/api/v1/admin/trust/settings')
      .set(support.auth)
      .expect(403);
    await resetSettings();
  });
});
