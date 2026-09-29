import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * docs/06 §9.3 "Тесты утечки контактов клиента": before the bid is
 * accepted (and, after it, without an active subscription) no response an
 * attorney can obtain — case feed and detail, own bid, pre-acceptance
 * chat, search, notifications, contacts endpoint — carries the client's
 * name, phone or e-mail. Masking in chat is checked on the wire, not in
 * the DB.
 */
jest.setTimeout(90_000);

describe('security — client contact leak (e2e, docs/06 §9.3)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let baseUrl = '';
  let practiceAreaId = '';
  const api = () => request(baseUrl);

  // One identity per test run (unique phone/e-mail), unusual enough that
  // a match in a response body cannot be a coincidence.
  const FIRST = 'Dana';
  const LAST = 'Clientova';
  const digits = String(1_000_000 + Math.floor(Math.random() * 8_999_999));
  const PHONE = `+1201${digits}`;
  const EMAIL = `dana.clientova.${digits}@example.com`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app as NestExpressApplication);
    await app.init();
    await app.listen(0);
    const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
    prisma = app.get(PrismaService);
    tokens = app.get(TokenService);
    await prisma.state.upsert({
      where: { code: 'NJ' },
      create: { code: 'NJ', name: 'New Jersey', is_active: true },
      update: {},
    });
    practiceAreaId = (
      await prisma.practiceArea.upsert({
        where: { code: 'e2e_leak_leaf' },
        create: {
          code: 'e2e_leak_leaf',
          name_en: 'E2E leak',
          i18n_key: 'practice.e2e_leak_leaf',
          sort: 1,
        },
        update: {},
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  function bearer(id: string, role: 'client' | 'attorney') {
    return {
      Authorization: `Bearer ${tokens.signAccessToken({
        sub: id,
        role,
        sid: randomUUID(),
        verified: role === 'attorney',
        subscriptionStatus: 'none',
      })}`,
    };
  }

  async function client(suffix = '') {
    const u = await prisma.user.create({
      data: {
        role: 'client',
        first_name: FIRST,
        last_name: LAST,
        phone_e164: `${PHONE}${suffix}`,
        phone_verified_at: new Date(),
        email: suffix ? `${suffix}.${EMAIL}` : EMAIL,
        email_verified_at: new Date(),
        client_profile: {
          create: {
            state_code: 'NJ',
            preferred_languages: ['en'],
            preferred_contact_method: 'call',
          },
        },
      },
    });
    return { id: u.id, auth: bearer(u.id, 'client') };
  }

  async function attorney(subscribed = true) {
    const tag = randomUUID().slice(0, 8);
    const u = await prisma.user.create({
      data: {
        role: 'attorney',
        first_name: 'Saul',
        last_name: 'Goodman',
        attorney_profile: {
          create: {
            username: `att_${tag}`,
            username_lower: `att_${tag}`,
            languages: ['en'],
            verification_status: 'verified',
            licenses: {
              create: {
                state_code: 'NJ',
                bar_number: `NJ-${tag}`,
                license_status: 'verified',
              },
            },
            practice_areas: { create: { practice_area_id: practiceAreaId } },
          },
        },
        ...(subscribed
          ? {
              subscription: {
                create: { status: 'active', price_cents: 39900 },
              },
            }
          : {}),
      },
    });
    return { id: u.id, auth: bearer(u.id, 'attorney') };
  }

  async function kase(clientId: string) {
    const c = await prisma.case.create({
      data: {
        client_id: clientId,
        title: 'Speeding ticket in Trenton (leak probe)',
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

  /** Any trace of the client's identity in a response body. */
  function leaks(body: unknown): string[] {
    const s = JSON.stringify(body);
    const found: string[] = [];
    if (s.includes(FIRST)) found.push('first name');
    if (s.includes(LAST)) found.push('last name');
    if (s.includes(PHONE) || s.includes(PHONE.slice(2))) found.push('phone');
    if (s.includes(digits)) found.push('phone digits');
    if (s.toLowerCase().includes(EMAIL)) found.push('email');
    if (s.includes('dana.clientova')) found.push('email local part');
    return found;
  }

  it('before acceptance: feed, case, bid, chat, search, notifications, contacts', async () => {
    const c = await client();
    const a = await attorney();
    const caseId = await kase(c.id);

    const feed = await api().get('/api/v1/cases?limit=20').set(a.auth);
    expect(feed.status).toBe(200);
    expect(leaks(feed.body)).toEqual([]);

    const detail = await api().get(`/api/v1/cases/${caseId}`).set(a.auth);
    expect(detail.status).toBe(200);
    expect(leaks(detail.body)).toEqual([]);

    const bid = await api()
      .post(`/api/v1/cases/${caseId}/bids`)
      .set(a.auth)
      .set('Idempotency-Key', randomUUID())
      .send({
        feeType: 'fixed',
        amountCents: 50_000,
        message: 'I handle NJ speeding tickets every week, happy to help.',
        startAvailability: 'immediately',
      });
    if (bid.status !== 201) throw new Error(JSON.stringify(bid.body));
    expect(leaks(bid.body)).toEqual([]);
    const bidId = bid.body.data.id as string;
    const bidView = await api().get(`/api/v1/bids/${bidId}`).set(a.auth);
    expect(leaks(bidView.body)).toEqual([]);

    // Pre-acceptance chat: the client types their phone and e-mail; the
    // attorney must see a masked body.
    const conv = await prisma.conversation.create({
      data: {
        case_id: caseId,
        bid_id: bidId,
        client_id: c.id,
        attorney_id: a.id,
        status: 'pre_acceptance',
        contacts_unlocked: false,
        participants: { create: [{ user_id: c.id }, { user_id: a.id }] },
      },
    });
    const sent = await api()
      .post(`/api/v1/conversations/${conv.id}/messages`)
      .set(c.auth)
      .send({
        clientMessageId: randomUUID(),
        body: `Call me ${PHONE} or write ${EMAIL}, also 201 555 0142`,
      });
    expect(sent.status).toBe(201);
    for (const path of [
      '/api/v1/conversations',
      `/api/v1/conversations/${conv.id}`,
      `/api/v1/conversations/${conv.id}/messages`,
    ]) {
      const res = await api().get(path).set(a.auth);
      expect(res.status).toBe(200);
      if (leaks(res.body).length > 0) {
        throw new Error(
          `${path} leaks ${leaks(res.body).join(', ')}: ${JSON.stringify(res.body)}`,
        );
      }
    }

    const search = await api()
      .get('/api/v1/search/cases?q=Speeding')
      .set(a.auth);
    expect(search.status).toBe(200);
    expect(leaks(search.body)).toEqual([]);

    const notifications = await api().get('/api/v1/notifications').set(a.auth);
    expect(notifications.status).toBe(200);
    expect(leaks(notifications.body)).toEqual([]);

    const contacts = await api()
      .get(`/api/v1/cases/${caseId}/contacts`)
      .set(a.auth);
    expect([403, 404]).toContain(contacts.status);
    expect(leaks(contacts.body)).toEqual([]);

    // Bid decline / counter payloads and the client's own case view are
    // the client's business; the attorney never sees the client profile.
    const stranger = await attorney();
    const strangerBid = await api()
      .get(`/api/v1/bids/${bidId}`)
      .set(stranger.auth);
    expect([403, 404]).toContain(strangerBid.status);
  });

  it('after acceptance without an active subscription: contacts stay locked', async () => {
    const c = await client('2');
    const a = await attorney(false);
    const caseId = await kase(c.id);
    const bid = await prisma.bid.create({
      data: {
        case_id: caseId,
        attorney_id: a.id,
        fee_type: 'fixed',
        amount_cents: 50_000,
        message: 'Hi',
        start_availability: 'immediately',
        turn: 'client',
        status: 'accepted',
      },
    });
    await prisma.case.update({
      where: { id: caseId },
      data: { status: 'in_progress', accepted_bid_id: bid.id },
    });
    const contacts = await api()
      .get(`/api/v1/cases/${caseId}/contacts`)
      .set(a.auth);
    expect(contacts.status).toBe(403);
    // Both gates keep the contacts hidden; which one answers first is
    // an implementation detail (no disclosure row without a real accept).
    expect(['SUBSCRIPTION_REQUIRED', 'CONTACTS_LOCKED']).toContain(
      contacts.body.error.code,
    );
    expect(leaks(contacts.body)).toEqual([]);
    const work = await api().get('/api/v1/users/me/work').set(a.auth);
    expect(work.status).toBe(200);
    expect(leaks(work.body)).toEqual([]);
  });
});
