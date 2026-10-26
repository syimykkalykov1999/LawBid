import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { EntitlementsService } from '../src/modules/plans/entitlements.service';
import { FeatureFlagsService } from '../src/modules/feature-flags/services/feature-flags.service';
import { adminSession } from './support/admin-login';

/**
 * Owner 2026-10-05: the plan builder. The admin assembles plans out of
 * entitlements; EntitlementsService is the single gate; a client's plan
 * puts their cases first in the attorneys' feed; "offers in any state" is
 * a plan term; a toggle reaches subscribers at once, applyNow:false keeps
 * their frozen terms until the admin applies the change.
 */
jest.setTimeout(120_000);

type PlanRow = {
  id: string;
  code: string;
  amountCents: number;
  extraSeatCents: number | null;
  entitlements: Record<string, number | boolean | null>;
  highlights: { en: string; ru: string }[];
};
type PlansBody = {
  data: { plans: PlanRow[]; baseline?: PlanRow; catalog: unknown[] };
};
type FeedBody = { data: { id: string; priorityClient: boolean }[] };
const plansOf = (res: { body: unknown }) => (res.body as PlansBody).data;
const feedOf = (res: { body: unknown }) => (res.body as FeedBody).data;

describe('Plan builder (e2e, owner 2026-10-05)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let entitlements: EntitlementsService;
  let flags: FeatureFlagsService;
  let baseUrl = '';
  let practiceAreaId = '';
  let admin: Record<string, string>;

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
    app.setGlobalPrefix('api/v1', {
      exclude: ['/health/live', '/health/ready', '/docs', '/docs-json'],
    });
    await app.listen(0, '127.0.0.1');
    const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
    prisma = app.get(PrismaService);
    tokens = app.get(TokenService);
    entitlements = app.get(EntitlementsService);
    flags = app.get(FeatureFlagsService);
    for (const [code, name] of [
      ['NJ', 'New Jersey'],
      ['NY', 'New York'],
    ]) {
      await prisma.state.upsert({
        where: { code },
        create: { code, name, is_active: true },
        update: {},
      });
    }
    const area = await prisma.practiceArea.upsert({
      where: { code: 'e2e_plans_leaf' },
      create: {
        code: 'e2e_plans_leaf',
        name_en: 'E2E plans',
        i18n_key: 'practice.e2e_plans_leaf',
        sort: 1,
      },
      update: {},
    });
    practiceAreaId = area.id;
    admin = (await adminSession(baseUrl, prisma, 'super_admin')).auth;
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(baseUrl);

  async function user(
    role: 'client' | 'attorney',
  ): Promise<{ id: string; auth: Record<string, string> }> {
    const u = await prisma.user.create({ data: { role } });
    if (role === 'attorney') {
      const username = `att_${u.id.slice(0, 8)}`;
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
          state_code: 'NJ',
          bar_number: `NJ-${randomUUID()}`,
          license_status: 'verified',
        },
      });
      await prisma.attorneyPracticeArea.create({
        data: { attorney_id: u.id, practice_area_id: practiceAreaId },
      });
    }
    const token = tokens.signAccessToken({
      sub: u.id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    });
    return { id: u.id, auth: { Authorization: `Bearer ${token}` } };
  }

  async function kase(clientId: string, state = 'NJ'): Promise<string> {
    const c = await prisma.case.create({
      data: {
        client_id: clientId,
        title: `Case ${randomUUID().slice(0, 6)}`,
        description: 'A long enough description of the matter at hand.',
        practice_area_id: practiceAreaId,
        primary_state_code: state,
        budget_mode: 'clarify_later',
        status: 'open',
      },
    });
    await prisma.caseState.create({
      data: { case_id: c.id, state_code: state, is_primary: true },
    });
    return c.id;
  }

  const planByCode = async (code: string) => {
    const res = await api().get('/api/v1/admin/billing/plans').set(admin);
    expect(res.status).toBe(200);
    const plan = plansOf(res).plans.find((p) => p.code === code);
    if (!plan) throw new Error(`plan ${code} missing`);
    return plan;
  };

  /** The owner flips one term on a plan from the admin; everyone on it follows. */
  async function setTerm(
    code: string,
    key: string,
    value: boolean | number | null,
  ): Promise<void> {
    const plan = await planByCode(code);
    const res = await api()
      .put(`/api/v1/admin/billing/plans/${plan.id}`)
      .set(admin)
      .send({ entitlements: { ...plan.entitlements, [key]: value } });
    expect(res.status).toBe(200);
    await entitlements.invalidateAll();
  }

  async function conversation(clientId: string, attorneyId: string) {
    const caseId = await kase(clientId);
    const conv = await prisma.conversation.create({
      data: {
        case_id: caseId,
        client_id: clientId,
        attorney_id: attorneyId,
        status: 'active',
        contacts_unlocked: true,
        participants: {
          create: [{ user_id: clientId }, { user_id: attorneyId }],
        },
      },
    });
    return conv.id;
  }

  it('seeds the built-in plans and lists them for the app', async () => {
    const res = await api().get('/api/v1/plans?audience=attorney');
    expect(res.status).toBe(200);
    const codes = plansOf(res).plans.map((p) => p.code);
    expect(codes).toEqual(
      expect.arrayContaining(['attorney_monthly', 'attorney_yearly']),
    );
    expect(plansOf(res).baseline?.code).toBe('attorney_free');
    expect(plansOf(res).catalog.length).toBeGreaterThan(5);
    const yearly = plansOf(res).plans.find((p) => p.code === 'attorney_yearly');
    expect(yearly?.entitlements.included_seats).toBe(10);
    expect(typeof yearly?.amountCents).toBe('number');

    const client = await api().get('/api/v1/plans?audience=client');
    expect(client.body.data.plans[0].entitlements.priority_feed).toBe(true);
  });

  it('admin creates, edits, archives a plan; the app stops offering it', async () => {
    const code = `pro_${randomUUID().slice(0, 6)}`;
    const created = await api()
      .post('/api/v1/admin/billing/plans')
      .set(admin)
      .send({
        code,
        audience: 'attorney',
        interval: 'month',
        amountCents: 14900,
        name: { en: 'Pro', ru: 'Про' },
        entitlements: {
          included_seats: 2,
          max_seats: 10,
          extra_seat_price_cents: 2500,
          priority_search: true,
          max_active_bids: 3,
        },
        highlights: [{ en: 'Priority support', ru: 'Приоритетная поддержка' }],
        status: 'active',
      });
    expect(created.status).toBe(200);
    const plan = plansOf(created).plans.find((p) => p.code === code);
    if (!plan) throw new Error('plan missing');
    expect(plan.amountCents).toBe(14900);
    expect(plan.extraSeatCents).toBe(2500);
    expect(plan.entitlements.max_active_bids).toBe(3);
    expect(plan.highlights[0].ru).toBe('Приоритетная поддержка');

    const pub = await api().get('/api/v1/plans?audience=attorney');
    expect(plansOf(pub).plans.map((p) => p.code)).toContain(code);

    const edited = await api()
      .put(`/api/v1/admin/billing/plans/${plan.id}`)
      .set(admin)
      .send({ entitlements: { ...plan.entitlements, priority_search: false } });
    expect(edited.status).toBe(200);
    expect(
      plansOf(edited).plans.find((p) => p.id === plan.id)?.entitlements
        .priority_search,
    ).toBe(false);

    const archived = await api()
      .post(`/api/v1/admin/billing/plans/${plan.id}/archive`)
      .set(admin);
    expect(archived.status).toBe(200);
    const after = await api().get('/api/v1/plans?audience=attorney');
    expect(plansOf(after).plans.map((p) => p.code)).not.toContain(code);

    const dup = await api()
      .post('/api/v1/admin/billing/plans')
      .set(admin)
      .send({
        code,
        audience: 'attorney',
        interval: 'month',
        amountCents: 100,
      });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('PLAN_CODE_EXISTS');
  });

  it('a toggle on the plan reaches subscribers at once; applyNow:false keeps frozen terms until the admin applies', async () => {
    const yearly = await planByCode('attorney_yearly');
    const a = await user('attorney');
    await prisma.subscription.update({
      where: { user_id: a.id },
      data: {
        plan: 'yearly',
        plan_id: yearly.id,
        entitlements: {
          included_seats: 6,
          max_seats: 6,
          priority_search: true,
        },
      },
    });
    let me = await api().get('/api/v1/me/entitlements').set(a.auth);
    expect(me.status).toBe(200);
    expect(me.body.data.source).toBe('plan');
    expect(me.body.data.seats.included).toBe(6);

    // Default: the owner switches a feature off and it is off for everyone.
    const current = await planByCode('attorney_yearly');
    const off = await api()
      .put(`/api/v1/admin/billing/plans/${yearly.id}`)
      .set(admin)
      .send({
        entitlements: { ...current.entitlements, priority_search: false },
      });
    expect(off.status).toBe(200);
    me = await api().get('/api/v1/me/entitlements').set(a.auth);
    expect(me.body.data.values.priority_search).toBe(false);

    // applyNow:false changes the included seats only for new buyers.
    const edit = await api()
      .put(`/api/v1/admin/billing/plans/${yearly.id}`)
      .set(admin)
      .send({
        applyNow: false,
        entitlements: { ...current.entitlements, included_seats: 8 },
      });
    expect(edit.status).toBe(200);
    me = await api().get('/api/v1/me/entitlements').set(a.auth);
    expect(me.body.data.seats.included).toBe(10); // frozen

    const applied = await api()
      .post(`/api/v1/admin/billing/plans/${yearly.id}/apply-to-subscribers`)
      .set(admin)
      .send({ reason: 'More seats for everyone on Prime' });
    expect(applied.status).toBe(200);
    expect(applied.body.data.updated).toBeGreaterThanOrEqual(1);
    me = await api().get('/api/v1/me/entitlements').set(a.auth);
    expect(me.body.data.seats.included).toBe(8);

    // Put the seed back for the other suites.
    await api()
      .put(`/api/v1/admin/billing/plans/${yearly.id}`)
      .set(admin)
      .send({ entitlements: { ...current.entitlements, included_seats: 10 } });
  });

  it('"offers in any state" is a plan term (baseline off → 403)', async () => {
    const client = await user('client');
    const nyCase = await kase(client.id, 'NY');
    const a = await user('attorney'); // licensed in NJ only, pre-plan row
    const baseline = await planByCode('attorney_free');
    const monthly = await planByCode('attorney_monthly');
    const body = {
      feeType: 'fixed',
      amountCents: 60_000,
      message: 'I can take this matter on and start right away.',
      startAvailability: 'immediately',
    };
    // The attorney's pre-plan monthly row follows the default monthly plan.
    await api()
      .put(`/api/v1/admin/billing/plans/${monthly.id}`)
      .set(admin)
      .send({
        entitlements: { ...monthly.entitlements, bids_any_state: false },
      });
    await entitlements.invalidateAll();
    const denied = await api()
      .post(`/api/v1/cases/${nyCase}/bids`)
      .set(a.auth)
      .set('Idempotency-Key', randomUUID())
      .send(body);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('LICENSE_STATE_REQUIRED');

    await api()
      .put(`/api/v1/admin/billing/plans/${monthly.id}`)
      .set(admin)
      .send({
        entitlements: { ...monthly.entitlements, bids_any_state: true },
      });
    await entitlements.invalidateAll();
    const allowed = await api()
      .post(`/api/v1/cases/${nyCase}/bids`)
      .set(a.auth)
      .set('Idempotency-Key', randomUUID())
      .send(body);
    expect(allowed.status).toBe(201);
    expect(baseline.code).toBe('attorney_free');
  });

  it('a client plan with "cases first" puts the client\'s case on top of the feed', async () => {
    const plus = await planByCode('client_plus');
    const plain = await user('client');
    const vip = await user('client');
    await prisma.clientSubscription.create({
      data: {
        user_id: vip.id,
        plan_id: plus.id,
        status: 'active',
        price_cents: 1000,
        stripe_subscription_id: `sub_e2e_${randomUUID().slice(0, 8)}`,
      },
    });
    const vipCase = await kase(vip.id);
    await new Promise((r) => setTimeout(r, 20));
    const newer = await kase(plain.id);

    const vipMe = await api().get('/api/v1/me/entitlements').set(vip.auth);
    expect(vipMe.body.data.source).toBe('plan');
    expect(vipMe.body.data.values.priority_feed).toBe(true);
    const plainMe = await api().get('/api/v1/me/entitlements').set(plain.auth);
    expect(plainMe.body.data.values.priority_feed).toBe(false);

    const a = await user('attorney');
    const feed = await api().get('/api/v1/cases').set(a.auth);
    expect(feed.status).toBe(200);
    const ids = feedOf(feed).map((c) => c.id);
    expect(ids.indexOf(vipCase)).toBeLessThan(ids.indexOf(newer));
    const first = feedOf(feed).find((c) => c.id === vipCase);
    expect(first?.priorityClient).toBe(true);
    expect(ids).toContain(newer);
    expect(ids.filter((id) => id === vipCase)).toHaveLength(1);
  });

  it("the client's plan screen lists plans and the checkout needs a sellable plan", async () => {
    const c = await user('client');
    const me = await api().get('/api/v1/client-plans/me').set(c.auth);
    expect(me.status).toBe(200);
    expect(me.body.data.isActive).toBe(false);
    expect(me.body.data.plans.length).toBeGreaterThanOrEqual(1);
    const bad = await api()
      .post('/api/v1/client-plans/checkout')
      .set(c.auth)
      .send({ planCode: 'attorney_monthly' });
    expect(bad.status).toBe(409);
    expect(bad.body.error.code).toBe('PLAN_NOT_AVAILABLE');
    const attorney = await user('attorney');
    const forbidden = await api()
      .get('/api/v1/client-plans/me')
      .set(attorney.auth);
    expect(forbidden.status).toBe(403);
  });

  // ---- every catalog term is a real gate (owner 2026-10-05) ---------------

  it('calls: off on the plan → 403 ENTITLEMENT_REQUIRED, on → the call rings', async () => {
    const c = await user('client');
    const a = await user('attorney'); // pre-plan row → default monthly plan
    const conv = await conversation(c.id, a.id);
    await setTerm('attorney_monthly', 'calls', false);
    const denied = await api()
      .post(`/api/v1/conversations/${conv}/calls`)
      .set(a.auth);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('ENTITLEMENT_REQUIRED');
    await setTerm('attorney_monthly', 'calls', true);
    const ok = await api()
      .post(`/api/v1/conversations/${conv}/calls`)
      .set(a.auth);
    expect(ok.status).toBe(201);
    await api().post(`/api/v1/calls/${ok.body.data.id}/end`).set(a.auth);
  });

  it('video calls: off on the plan → 403 ENTITLEMENT_REQUIRED before the flag check', async () => {
    const c = await user('client');
    const a = await user('attorney');
    const conv = await conversation(c.id, a.id);
    await setTerm('attorney_monthly', 'video_calls', false);
    const denied = await api()
      .post(`/api/v1/conversations/${conv}/calls`)
      .set(a.auth)
      .send({ video: true });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('ENTITLEMENT_REQUIRED');
    await setTerm('attorney_monthly', 'video_calls', true);
    const next = await api()
      .post(`/api/v1/conversations/${conv}/calls`)
      .set(a.auth)
      .send({ video: true });
    // The plan no longer blocks; the global flag / TURN keys decide next.
    expect(next.body.error?.code).not.toBe('ENTITLEMENT_REQUIRED');
  });

  it('chat translation: a client without the term gets 403 before anything else', async () => {
    const c = await user('client');
    const a = await user('attorney');
    const conv = await conversation(c.id, a.id);
    const msg = await prisma.message.create({
      data: {
        conversation_id: conv,
        sender_id: a.id,
        type: 'text',
        body_original: 'Hello from the attorney',
        body_display: 'Hello from the attorney',
        client_message_id: randomUUID(),
      },
    });
    const translate = () =>
      api()
        .post(`/api/v1/conversations/${conv}/messages/${msg.id}/translate`)
        .set(c.auth)
        .send({ target: 'ru' });
    await setTerm('client_free', 'chat_translate', false);
    const denied = await translate();
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('ENTITLEMENT_REQUIRED');
    await setTerm('client_free', 'chat_translate', true);
    const next = await translate();
    expect(next.status).not.toBe(403); // 503 (no Google key) — the plan no longer blocks
  });

  it('video posts: the global flag is on but the plan says no → 403', async () => {
    await prisma.featureFlag.upsert({
      where: { key: 'video_posts' },
      create: { key: 'video_posts', enabled: true },
      update: { enabled: true },
    });
    await flags.invalidate();
    const c = await user('client');
    const presign = () =>
      api()
        .post('/api/v1/files/presign')
        .set(c.auth)
        .send({
          purpose: 'post_video',
          mime: 'image/jpeg',
          sizeBytes: 1000,
          sha256: 'a'.repeat(64),
        });
    await setTerm('client_free', 'video_posts', false);
    const denied = await presign();
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('ENTITLEMENT_REQUIRED');
    await setTerm('client_free', 'video_posts', true);
    const next = await presign();
    expect(next.body?.error?.code).not.toBe('ENTITLEMENT_REQUIRED');
    await prisma.featureFlag.deleteMany({ where: { key: 'video_posts' } });
    await flags.invalidate();
  });

  it('posts per day: the plan caps an attorney at 1 post, 0 lifts the cap', async () => {
    const a = await user('attorney'); // verified → may post
    const post = () =>
      api()
        .post('/api/v1/posts')
        .set(a.auth)
        .set('Idempotency-Key', randomUUID())
        .send({
          title: 'Hello',
          body: 'A post about the practice.',
          practiceCode: 'e2e_plans_leaf',
        });
    await setTerm('attorney_monthly', 'posts_per_day', 1);
    const first = await post();
    expect(first.status).toBe(201);
    const second = await post();
    expect(second.status).toBe(429);
    expect(second.body.error.code).toBe('RATE_LIMITED');
    await setTerm('attorney_monthly', 'posts_per_day', 0);
    const third = await post();
    expect(third.status).toBe(201);
    await setTerm('attorney_monthly', 'posts_per_day', null);
  });

  it('case promotion: a client plan term only when the admin requires one', async () => {
    const c = await user('client');
    await setTerm('client_free', 'case_promotion', false);
    // Owner 2026-10-05: promotion needs no subscription by default.
    const free = await api().get('/api/v1/promotions/quote?days=1').set(c.auth);
    expect(free.status).toBe(200);
    await prisma.appConfig.upsert({
      where: { key: 'promotions.settings' },
      create: {
        key: 'promotions.settings',
        value: { requireSubscription: true },
      },
      update: { value: { requireSubscription: true } },
    });
    const denied = await api()
      .get('/api/v1/promotions/quote?days=1')
      .set(c.auth);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('ENTITLEMENT_REQUIRED');
    await setTerm('client_free', 'case_promotion', true);
    const ok = await api().get('/api/v1/promotions/quote?days=1').set(c.auth);
    expect(ok.status).toBe(200);
    await prisma.appConfig.delete({ where: { key: 'promotions.settings' } });
  });
  /**
   * Owner 2026-10-14: a plan built in the admin from a set of functions
   * switches them on for subscribers of BOTH roles (seen in the app's own
   * /me/entitlements), and they go off again once the subscription ends.
   */
  it('a custom plan turns its functions on for both roles and off after cancel', async () => {
    type Me = {
      data: {
        source: string;
        isPaid: boolean;
        values: Record<string, unknown>;
      };
    };
    const mine = async (auth: Record<string, string>) =>
      ((await api().get('/api/v1/me/entitlements').set(auth)) as { body: Me })
        .body.data;
    const make = async (
      audience: 'attorney' | 'client',
      terms: Record<string, number | boolean>,
    ) => {
      const code = `life_${audience}_${randomUUID().slice(0, 6)}`;
      const res = await api()
        .post('/api/v1/admin/billing/plans')
        .set(admin)
        .send({
          code,
          audience,
          interval: 'month',
          amountCents: 1900,
          name: { en: 'Custom', ru: 'Свой' },
          entitlements: terms,
          status: 'active',
        });
      expect(res.status).toBe(200);
      const plan = plansOf(res).plans.find((p) => p.code === code);
      if (!plan) throw new Error('plan missing');
      return plan;
    };

    const attorneyPlan = await make('attorney', {
      priority_search: true,
      max_active_bids: 7,
    });
    const clientPlan = await make('client', {
      chat_translate: true,
      verified_badge: true,
    });
    const a = await user('attorney');
    const c = await user('client');
    await prisma.subscription.update({
      where: { user_id: a.id },
      data: { plan_id: attorneyPlan.id },
    });
    const clientSub = await prisma.clientSubscription.create({
      data: {
        user_id: c.id,
        plan_id: clientPlan.id,
        status: 'active',
        price_cents: 1900,
        stripe_subscription_id: `sub_e2e_${randomUUID().slice(0, 8)}`,
      },
    });
    await entitlements.invalidateAll();

    const aOn = await mine(a.auth);
    expect(aOn.isPaid).toBe(true);
    expect(aOn.values.priority_search).toBe(true);
    expect(aOn.values.max_active_bids).toBe(7);
    const cOn = await mine(c.auth);
    expect(cOn.isPaid).toBe(true);
    expect(cOn.values.chat_translate).toBe(true);
    expect(cOn.values.verified_badge).toBe(true);

    // The subscription ends: attorney (cancelled) and client (period over).
    await prisma.subscription.update({
      where: { user_id: a.id },
      data: { status: 'canceled', plan_id: attorneyPlan.id },
    });
    await prisma.clientSubscription.update({
      where: { id: clientSub.id },
      data: {
        status: 'canceled',
        current_period_end: new Date(Date.now() - 1000),
      },
    });
    await entitlements.invalidateUser(a.id);
    await entitlements.invalidateUser(c.id);

    const aOff = await mine(a.auth);
    expect(aOff.isPaid).toBe(false);
    expect(aOff.values.max_active_bids).not.toBe(7);
    const cOff = await mine(c.auth);
    expect(cOff.isPaid).toBe(false);
    expect(cOff.values.verified_badge).not.toBe(true);
  });
  /** Owner 2026-10-14: a feature is data — created in the admin, no release. */
  it('a feature created in the admin is switchable per plan and reaches users by key', async () => {
    const key = `own_${randomUUID().slice(0, 6).replace(/-/g, '')}`;
    const made = await api()
      .post('/api/v1/admin/billing/entitlements')
      .set(admin)
      .send({
        key,
        type: 'boolean',
        audiences: ['client'],
        group: 'features',
        label: { en: 'Own feature', ru: 'Своя функция' },
        description: { en: 'Made by the owner', ru: 'Создано владельцем' },
      });
    expect(made.status).toBe(200);
    // Built-in keys and repeats are refused.
    await api()
      .post('/api/v1/admin/billing/entitlements')
      .set(admin)
      .send({
        key: 'calls',
        type: 'boolean',
        audiences: ['client'],
        group: 'features',
        label: { en: 'x', ru: 'x' },
        description: { en: 'x', ru: 'x' },
      })
      .expect(409);
    const dup = await api()
      .post('/api/v1/admin/billing/entitlements')
      .set(admin)
      .send({
        key,
        type: 'boolean',
        audiences: ['client'],
        group: 'features',
        label: { en: 'x', ru: 'x' },
        description: { en: 'x', ru: 'x' },
      });
    expect(dup.status).toBe(409);

    const list = await api().get('/api/v1/admin/billing/plans').set(admin);
    const entry = (
      list.body.data.catalog as { key: string; custom?: boolean }[]
    ).find((d) => d.key === key);
    expect(entry?.custom).toBe(true);

    // On the client baseline plan: every client without a plan has it.
    const c = await user('client');
    const me = async (): Promise<{
      customValues: Record<string, unknown>;
    }> =>
      (await api().get('/api/v1/me/entitlements').set(c.auth)).body.data as {
        customValues: Record<string, unknown>;
      };
    expect((await me()).customValues[key]).toBeUndefined();
    await setTerm('client_free', key, true);
    expect((await me()).customValues[key]).toBe(true);
    expect(await entitlements.has(c.id, key)).toBe(true);
    await setTerm('client_free', key, false);
    expect(await entitlements.has(c.id, key)).toBe(false);

    await api()
      .delete(`/api/v1/admin/billing/entitlements/${key}`)
      .set(admin)
      .expect(200);
    await api()
      .delete('/api/v1/admin/billing/entitlements/calls')
      .set(admin)
      .expect(404);
    expect((await me()).customValues[key]).toBeUndefined();
  });
  it('offers per month: the plan caps new offers, resending one is free, 0 lifts the cap', async () => {
    const c = await user('client');
    const a = await user('attorney');
    const first = await kase(c.id);
    const second = await kase(c.id);
    const bid = (caseId: string, amountCents: number) =>
      api()
        .post(`/api/v1/cases/${caseId}/bids`)
        .set(a.auth)
        .set('Idempotency-Key', randomUUID())
        .send({
          feeType: 'fixed',
          amountCents,
          message: 'I can take this matter and start right away.',
          startAvailability: 'immediately',
        });
    await setTerm('attorney_monthly', 'bids_per_month', 1);
    const ok = await bid(first, 50_000);
    expect(ok.status).toBe(201);
    const denied = await bid(second, 50_000);
    expect(denied.status).toBe(409);
    expect(denied.body.error.code).toBe('BID_MONTHLY_LIMIT_REACHED');
    expect(denied.body.error.details).toMatchObject({ limit: 1, used: 1 });
    // The same case again is a change, not a new offer.
    const again = await bid(first, 45_000);
    expect(again.body?.error?.code).not.toBe('BID_MONTHLY_LIMIT_REACHED');
    await setTerm('attorney_monthly', 'bids_per_month', 0);
    expect((await bid(second, 50_000)).status).toBe(201);
    await setTerm('attorney_monthly', 'bids_per_month', 30);
  });
  it("trial: ends by days or by the plan's number of offers, whichever comes first", async () => {
    const c = await user('client');
    const a = await user('attorney');
    await prisma.subscription.update({
      where: { user_id: a.id },
      data: { status: 'trialing', trial_started_at: new Date() },
    });
    const first = await kase(c.id);
    const second = await kase(c.id);
    const bid = (caseId: string) =>
      api()
        .post(`/api/v1/cases/${caseId}/bids`)
        .set(a.auth)
        .set('Idempotency-Key', randomUUID())
        .send({
          feeType: 'fixed',
          amountCents: 50_000,
          message: 'I can take this matter and start right away.',
          startAvailability: 'immediately',
        });
    await setTerm('attorney_monthly', 'trial_bids', 1);
    expect((await bid(first)).status).toBe(201);
    const denied = await bid(second);
    expect(denied.status).toBe(409);
    expect(denied.body.error.code).toBe('BID_TRIAL_LIMIT_REACHED');
    // A paying attorney is not held by the trial number.
    await prisma.subscription.update({
      where: { user_id: a.id },
      data: { status: 'active' },
    });
    expect((await bid(second)).status).toBe(201);
    await setTerm('attorney_monthly', 'trial_bids', 5);
  });
  it('attorney statistics: profile opens, offers, accepted, clients', async () => {
    const c = await user('client');
    const a = await user('attorney');
    const profile = await prisma.attorneyProfile.findUniqueOrThrow({
      where: { user_id: a.id },
      select: { username: true },
    });
    for (let i = 0; i < 2; i += 1) {
      await api()
        .get(`/api/v1/attorneys/${profile.username}`)
        .set(c.auth)
        .expect(200);
    }
    // The attorney opening their own profile is not a view.
    await api().get(`/api/v1/attorneys/${profile.username}`).set(a.auth);
    await new Promise((r) => setTimeout(r, 300));
    const stats = await api().get('/api/v1/attorneys/me/stats').set(a.auth);
    expect(stats.status).toBe(200);
    expect(stats.body.data).toMatchObject({
      profileViews30d: 2,
      bidsSent30d: 0,
      bidsAccepted30d: 0,
      clientsTotal: 0,
    });
  });
  it('offer packs: behind a flag, sizes and prices from the admin, bought offers are spent above the limit', async () => {
    const c = await user('client');
    const a = await user('attorney');
    const cases = [await kase(c.id), await kase(c.id), await kase(c.id)];
    const bid = (caseId: string) =>
      api()
        .post(`/api/v1/cases/${caseId}/bids`)
        .set(a.auth)
        .set('Idempotency-Key', randomUUID())
        .send({
          feeType: 'fixed',
          amountCents: 50_000,
          message: 'I can take this matter and start right away.',
          startAvailability: 'immediately',
        });
    await prisma.featureFlag.upsert({
      where: { key: 'bid_packs' },
      create: { key: 'bid_packs', enabled: false, description: 'packs' },
      update: { enabled: false },
    });
    // Off: nothing on sale.
    const off = await api().get('/api/v1/bid-packs').set(a.auth).expect(200);
    expect(off.body.data).toMatchObject({ enabled: false, packs: [] });
    await api().post('/api/v1/bid-packs/pack_10/buy').set(a.auth).expect(409);

    await prisma.featureFlag.update({
      where: { key: 'bid_packs' },
      data: { enabled: true },
    });
    await api()
      .put('/api/v1/admin/billing/bid-packs')
      .set(admin)
      .send({ packs: [{ id: 'pack_2', bids: 2, priceCents: 500 }] })
      .expect(200);
    const on = await api().get('/api/v1/bid-packs').set(a.auth).expect(200);
    expect(on.body.data.packs).toEqual([
      { id: 'pack_2', bids: 2, priceCents: 500 },
    ]);
    // Owner 2026-10-22 (security audit #3, finding 8): a client has no
    // attorney profile and used to pass the verification check.
    const notAttorney = await api()
      .post('/api/v1/bid-packs/pack_2/buy')
      .set(c.auth)
      .expect(403);
    expect(notAttorney.body.error.code).toBe('FORBIDDEN');

    await setTerm('attorney_monthly', 'bids_per_month', 1);
    expect((await bid(cases[0])).status).toBe(201);
    expect((await bid(cases[1])).body.error.code).toBe(
      'BID_MONTHLY_LIMIT_REACHED',
    );

    const buy = await api()
      .post('/api/v1/bid-packs/pack_2/buy')
      .set(a.auth)
      .expect(200);
    const { purchaseId, checkoutUrl } = buy.body.data as {
      purchaseId: string;
      checkoutUrl: string;
    };
    expect(checkoutUrl).toContain('/fake-checkout/');
    const row = await prisma.bidPackPurchase.findUniqueOrThrow({
      where: { id: purchaseId },
    });
    await api()
      .post(`/api/v1/subscriptions/fake-checkout/${row.stripe_checkout_id}/pay`)
      .expect(201);
    const done = await api()
      .get(`/api/v1/bid-packs/purchases/${purchaseId}`)
      .set(a.auth)
      .expect(200);
    expect(done.body.data).toMatchObject({ status: 'paid', balance: 2 });
    // Paying twice credits once.
    await api()
      .post(`/api/v1/subscriptions/fake-checkout/${row.stripe_checkout_id}/pay`)
      .catch(() => undefined);
    expect(
      (await api().get('/api/v1/bid-packs').set(a.auth)).body.data.balance,
    ).toBe(2);

    expect((await bid(cases[1])).status).toBe(201);
    expect((await bid(cases[2])).status).toBe(201);
    expect(
      (await api().get('/api/v1/bid-packs').set(a.auth)).body.data.balance,
    ).toBe(0);
    await setTerm('attorney_monthly', 'bids_per_month', 30);
    await prisma.featureFlag.update({
      where: { key: 'bid_packs' },
      data: { enabled: false },
    });
  });
});
