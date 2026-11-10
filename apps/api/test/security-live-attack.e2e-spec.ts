import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import type { AddressInfo, Server } from 'node:net';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import type Redis from 'ioredis';

/**
 * Security audit 2026-11-08, the live pass the static audit deferred:
 * against the LOCAL stack only (never lawbid.dev), with the real body
 * parsers, validation pipe and guards (configureApp).
 *
 * Always on (regressions):
 * - mass assignment: unknown fields (role, owner ids, status…) are refused;
 * - oversize bodies: 413 above the global and the contacts-sync limits;
 * - rate limits do not reset with a new X-Device-Id;
 * - a duty-less assistant gets no attorney data from unmarked routes.
 *
 * LIVE_ATTACK=1 (local run): an IDOR fuzz of EVERY non-admin route — each
 * path parameter filled with another user's object ids, called by a
 * stranger client and a stranger attorney; every 2xx is written to
 * LIVE_ATTACK_REPORT for triage (docs/dev/SECURITY_ATTACK_2026-11-08.md §L).
 */
jest.setTimeout(600_000);

describe('Live attack pass 2026-11-08 (local stack)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let baseUrl = '';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      rawBody: true,
      bufferLogs: true,
    });
    configureApp(app);
    await app.init();
    await app.listen(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${((app.getHttpServer() as Server).address() as AddressInfo).port}`;
    prisma = app.get(PrismaService);
    tokens = app.get(TokenService);
  });

  afterAll(async () => {
    // The limits spent from 127.0.0.1 here must not reach the next suite.
    const redis = app.get<Redis>(REDIS_CLIENT);
    for (const pattern of ['*assist-login*', '*pwd-login*', '*pwd-backoff*']) {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) await redis.del(...keys);
    }
    await app.close();
  });

  const api = () => request(baseUrl);

  async function person(
    role: 'client' | 'attorney' | 'assistant',
    extra: Record<string, unknown> = {},
  ) {
    const u = await prisma.user.create({
      data: {
        role,
        first_name: 'Live',
        last_name: role,
        phone_e164: `+1202${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`,
        phone_verified_at: new Date(),
        ...extra,
      },
    });
    if (role === 'attorney') {
      await prisma.attorneyProfile.create({
        data: {
          user_id: u.id,
          username: `la_${u.id.slice(0, 8)}`,
          username_lower: `la_${u.id.slice(0, 8)}`,
          languages: ['en'],
          verification_status: 'verified',
        },
      });
    }
    const t = tokens.signAccessToken({
      sub: u.id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    });
    return { id: u.id, auth: { Authorization: `Bearer ${t}` } };
  }

  async function caseOf(clientId: string) {
    await prisma.state.upsert({
      where: { code: 'NJ' },
      create: { code: 'NJ', name: 'New Jersey' },
      update: {},
    });
    const area = await prisma.practiceArea.upsert({
      where: { code: 'live_attack' },
      create: { code: 'live_attack', name_en: 'L', i18n_key: 'l', sort: 0 },
      update: {},
    });
    return prisma.case.create({
      data: {
        client_id: clientId,
        title: 'Private case',
        description: 'secret details',
        practice_area_id: area.id,
        primary_state_code: 'NJ',
        budget_mode: 'clarify_later',
        status: 'open',
      },
    });
  }

  it('mass assignment: unknown or privileged fields are refused, nothing changes', async () => {
    const me = await person('client');
    const other = await person('client');
    const injected = {
      role: 'attorney',
      status: 'active',
      verified: true,
      isAdmin: true,
      user_id: other.id,
      userId: other.id,
      owner_id: other.id,
      phone_verified_at: new Date(0).toISOString(),
    };
    const res = await api()
      .patch('/api/v1/users/me')
      .set(me.auth)
      .send({ firstName: 'Ok', ...injected });
    expect(res.status).toBe(400);
    const kase = await caseOf(me.id);
    const res2 = await api()
      .patch(`/api/v1/cases/${kase.id}`)
      .set(me.auth)
      .send({ client_id: other.id, status: 'closed' });
    expect(res2.status).toBe(400);
    const row = await prisma.case.findUniqueOrThrow({ where: { id: kase.id } });
    expect(row.client_id).toBe(me.id);
    expect(row.status).toBe('open');
    const u = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    expect(u.role).toBe('client');
  });

  it('oversize bodies: 413 above the global and contacts-sync limits', async () => {
    const me = await person('client');
    const big = 'x'.repeat(300 * 1024);
    const res = await api()
      .patch('/api/v1/users/me')
      .set(me.auth)
      .set('content-type', 'application/json')
      .send(JSON.stringify({ firstName: big }));
    expect(res.status).toBe(413);
    const huge = 'a'.repeat(1100 * 1024);
    const res2 = await api()
      .post('/api/v1/contacts/sync')
      .set(me.auth)
      .set('content-type', 'application/json')
      .send(JSON.stringify({ full: true, added: [huge] }));
    expect(res2.status).toBe(413);
  });

  it('a new X-Device-Id does not reset the password sign-in backoff', async () => {
    const identifier = `live-${randomUUID().slice(0, 8)}@example.test`;
    const statuses: number[] = [];
    for (let i = 0; i < 9; i++) {
      const res = await api()
        .post('/api/v1/auth/password/login')
        .set('x-device-id', randomUUID())
        .send({
          identifier,
          password: `wrong-password-${i}`,
          deviceInfo: { deviceId: randomUUID(), platform: 'ios' },
        });
      statuses.push(res.status);
    }
    // The first wrong answers are 401; the backoff then refuses with 429
    // although every try came from a "new device".
    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
    expect(statuses).toContain(429);
  });

  it('a new X-Device-Id does not reset the assistant-code or SMS limits', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 24; i++) {
      const res = await api()
        .post('/api/v1/auth/assistant/code')
        .send({
          code: `ZZZZ${String(i).padStart(8, '2')}`,
          deviceInfo: { deviceId: randomUUID(), platform: 'ios' },
        });
      codes.push(res.status);
    }
    // 20 tries an hour per address, whatever the device says.
    expect(codes.filter((s) => s === 429).length).toBeGreaterThan(0);
    const phone = `+1202${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
    const sms: number[] = [];
    for (let i = 0; i < 8; i++) {
      const res = await api()
        .post('/api/v1/auth/otp/request')
        .set('x-device-id', randomUUID())
        .send({ channel: 'phone', identifier: phone });
      sms.push(res.status);
    }
    // The per-number budget holds for new devices too.
    expect(sms).toContain(429);
  });

  it('a duty-less assistant reads none of the attorney’s data from unmarked routes', async () => {
    const attorney = await person('attorney');
    const helper = await person('assistant');
    await prisma.subscription.create({
      data: {
        user_id: attorney.id,
        status: 'active',
        price_cents: 39900,
        plan: 'monthly',
        assistant_seats: 1,
      },
    });
    await prisma.assistantMembership.create({
      data: {
        attorney_id: attorney.id,
        assistant_user_id: helper.id,
        status: 'active',
        approval: 'attorney_added',
        duties: [],
      },
    });
    // Before the audit fix these answered with the attorney's data.
    for (const path of [
      '/api/v1/users/me/bids',
      '/api/v1/users/me/work',
      '/api/v1/saved-items',
      '/api/v1/stars',
      '/api/v1/me/promotions',
      '/api/v1/calendar/connections',
    ]) {
      const res = await api().get(path).set(helper.auth);
      expect({ path, status: res.status }).toEqual({ path, status: 403 });
    }
  });

  // Found by the fuzz below: a client saved "bid drafts" on a stranger's case.
  it('only an attorney saves a bid draft', async () => {
    const owner = await person('client');
    const stranger = await person('client');
    const lawyer = await person('attorney');
    const kase = await caseOf(owner.id);
    const body = { feeType: 'fixed', amountCents: 50000, message: 'draft' };
    const res = await api()
      .put(`/api/v1/cases/${kase.id}/bid-draft`)
      .set(stranger.auth)
      .send(body);
    expect(res.status).toBe(404);
    const ok = await api()
      .put(`/api/v1/cases/${kase.id}/bid-draft`)
      .set(lawyer.auth)
      .send(body);
    expect(ok.status).toBe(200);
    expect(
      await prisma.bidDraft.count({ where: { attorney_id: stranger.id } }),
    ).toBe(0);
  });

  const fuzz = process.env.LIVE_ATTACK === '1' ? it : it.skip;

  fuzz('IDOR fuzz: every non-admin route with another user’s ids', async () => {
    const victim = await person('client');
    const lawyer = await person('attorney');
    const kase = await caseOf(victim.id);
    const bid = await prisma.bid.create({
      data: {
        case_id: kase.id,
        attorney_id: lawyer.id,
        fee_type: 'fixed',
        amount_cents: 100000,
        message: 'private bid',
        start_availability: 'immediately',
        turn: 'client',
      },
    });
    const conv = await prisma.conversation.create({
      data: {
        case_id: kase.id,
        client_id: victim.id,
        attorney_id: lawyer.id,
        participants: {
          create: [{ user_id: victim.id }, { user_id: lawyer.id }],
        },
      },
    });
    const msg = await prisma.message.create({
      data: {
        conversation_id: conv.id,
        sender_id: victim.id,
        type: 'text',
        body_original: 'secret',
        body_display: 'secret',
        client_message_id: randomUUID(),
      },
    });
    const file = await prisma.file.create({
      data: {
        owner_user_id: victim.id,
        purpose: 'case_attachment',
        s3_bucket: 'b',
        s3_key: `k/${randomUUID()}`,
        mime: 'application/pdf',
        size_bytes: BigInt(10),
        sha256: 'a'.repeat(64),
        scan_status: 'clean',
      },
    });
    const ticket = await prisma.supportTicket.create({
      data: { user_id: victim.id, subject: 'private ticket' },
    });
    const task = await prisma.attorneyTask.create({
      data: { attorney_id: lawyer.id, kind: 'call', title: 'private task' },
    });
    const ids: Record<string, string> = {
      case: kase.id,
      bid: bid.id,
      conversation: conv.id,
      message: msg.id,
      file: file.id,
      ticket: ticket.id,
      task: task.id,
      victim: victim.id,
      lawyer: lawyer.id,
    };
    const strangerClient = await person('client');
    const strangerAttorney = await person('attorney');

    type Layer = {
      route?: { path: string | string[]; methods: Record<string, boolean> };
    };
    const router = (
      app.getHttpAdapter().getInstance() as { router: { stack: Layer[] } }
    ).router;
    const routes: { method: string; path: string }[] = [];
    for (const l of router.stack) {
      if (!l.route) continue;
      for (const p of [l.route.path].flat()) {
        for (const [m, on] of Object.entries(l.route.methods)) {
          if (on && m !== '_all') routes.push({ method: m, path: p });
        }
      }
    }
    const skip =
      /^\/api\/v1\/(admin|webhooks|auth|health|dev|demo)(\/|$)|^\/(health|metrics)/;
    const hits: {
      who: string;
      method: string;
      path: string;
      kind: string;
      status: number;
      body: string;
    }[] = [];
    let calls = 0;
    for (const r of routes) {
      if (skip.test(r.path)) continue;
      const params = r.path.match(/:[A-Za-z_]+/g) ?? [];
      if (params.length === 0) continue;
      for (const [kind, id] of Object.entries(ids)) {
        const url = r.path.replace(/:[A-Za-z_]+/g, id);
        for (const [who, caller] of [
          ['client', strangerClient],
          ['attorney', strangerAttorney],
        ] as const) {
          calls++;
          const req = (
            api() as unknown as Record<string, (u: string) => request.Test>
          )
            [r.method](url)
            .set(caller.auth)
            .timeout(5000);
          const res = await (
            r.method === 'get' || r.method === 'delete' ? req : req.send({})
          ).catch((e: { status?: number }) => ({
            status: e.status ?? 0,
            text: '',
          }));
          if (res.status >= 200 && res.status < 300) {
            hits.push({
              who,
              method: r.method.toUpperCase(),
              path: r.path,
              kind,
              status: res.status,
              body: String((res as { text?: string }).text ?? '').slice(0, 300),
            });
          }
        }
      }
    }
    // Mass assignment / prototype pollution: every body route without a
    // path parameter, with only privileged or unknown fields.
    const accepted: {
      who: string;
      method: string;
      path: string;
      status: number;
    }[] = [];
    for (const r of routes) {
      if (skip.test(r.path) || /:[A-Za-z_]/.test(r.path)) continue;
      if (!['post', 'put', 'patch'].includes(r.method)) continue;
      for (const [who, caller] of [
        ['client', strangerClient],
        ['attorney', strangerAttorney],
      ] as const) {
        calls++;
        const res = await (
          api() as unknown as Record<string, (u: string) => request.Test>
        )
          [r.method](r.path)
          .set(caller.auth)
          .set('content-type', 'application/json')
          .timeout(5000)
          .send(
            `{"role":"admin","isAdmin":true,"user_id":"${victim.id}","owner_id":"${victim.id}","status":"active","__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}`,
          )
          .catch((e: { status?: number }) => ({ status: e.status ?? 0 }));
        if (res.status >= 200 && res.status < 300) {
          accepted.push({
            who,
            method: r.method.toUpperCase(),
            path: r.path,
            status: res.status,
          });
        }
      }
    }
    const polluted = ({} as Record<string, unknown>).polluted === true;
    const roles = await prisma.user.findMany({
      where: { id: { in: [strangerClient.id, strangerAttorney.id] } },
      select: { role: true },
    });
    const out = process.env.LIVE_ATTACK_REPORT;
    if (out) {
      writeFileSync(
        out,
        JSON.stringify({ calls, hits, accepted, polluted, roles }, null, 1),
      );
    }
    expect(polluted).toBe(false);
    expect(roles.map((x) => x.role).sort()).toEqual(['attorney', 'client']);
    // The answer is the report; the run itself only proves the fuzz ran.
    expect(calls).toBeGreaterThan(100);
  });
});
