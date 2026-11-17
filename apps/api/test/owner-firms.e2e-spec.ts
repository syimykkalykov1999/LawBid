import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { FirmsService } from '../src/modules/firms/firms.service';
import { AccountAnonymizationService } from '../src/modules/privacy/account-anonymization.service';
import { shardContext } from '../src/sharding/shard-context';
import { REDIS_CLIENT } from '../src/redis/redis.constants';

/**
 * Owner 2026-10-14: a firm is its lawyers. Members keep their own licences;
 * the firm's states are the union; a bid on a case goes from the member whose
 * licence fits.
 */
jest.setTimeout(120_000);

describe('Firm profile (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let base = '';
  let tokens: TokenService;

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
    base = `http://127.0.0.1:${((app.getHttpServer() as Server).address() as AddressInfo).port}`;
    prisma = app.get(PrismaService);
    tokens = app.get(TokenService);
    for (const code of ['NJ', 'IL', 'NY']) {
      await prisma.state.upsert({
        where: { code },
        create: { code, name: code, is_active: true },
        update: {},
      });
    }
    await prisma.featureFlag.upsert({
      where: { key: 'firm_profiles' },
      create: { key: 'firm_profiles', enabled: true, description: 'e2e' },
      update: { enabled: true },
    });
  });

  afterAll(async () => {
    await prisma.featureFlag.update({
      where: { key: 'firm_profiles' },
      data: { enabled: false },
    });
    await app.close();
  });

  const auth = (id: string, role: 'attorney' | 'client') => ({
    Authorization: `Bearer ${tokens.signAccessToken({
      sub: id,
      role,
      sid: randomUUID(),
      verified: false,
      subscriptionStatus: 'none',
    })}`,
  });
  const api = () => request(base);

  async function lawyer(state: string) {
    const u = await prisma.user.create({
      data: { role: 'attorney', first_name: 'Law', last_name: state },
    });
    const username = `f${u.id.slice(0, 8)}`;
    await prisma.attorneyProfile.create({
      data: {
        user_id: u.id,
        username,
        username_lower: username,
        languages: ['en'],
        verification_status: 'verified',
      },
    });
    await prisma.attorneyLicense.create({
      data: {
        attorney_id: u.id,
        state_code: state,
        bar_number: `E${randomUUID().slice(0, 8)}`,
        license_status: 'verified',
      },
    });
    return { id: u.id, username, auth: auth(u.id, 'attorney') };
  }

  it('create, invite, accept; the firm page shows the union of states', async () => {
    const owner = await lawyer('NJ');
    const second = await lawyer('IL');
    const made = await api()
      .post('/api/v1/firms')
      .set(owner.auth)
      .send({ name: 'Wexler & Co' });
    expect(made.status).toBe(201);
    const firmId = made.body.data.id as string;

    const again = await api()
      .post('/api/v1/firms')
      .set(owner.auth)
      .send({ name: 'Second' });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('FIRM_ALREADY_MEMBER');

    await api()
      .post('/api/v1/firms/me/members')
      .set(owner.auth)
      .send({ username: second.username })
      .expect(200);
    // Not on the public page until accepted.
    let page = await api()
      .get(`/api/v1/firms/${firmId}`)
      .set(owner.auth)
      .expect(200);
    expect(page.body.data.members).toHaveLength(1);
    expect(page.body.data.states).toEqual(['NJ']);

    const inbox = await api()
      .get('/api/v1/firms/me')
      .set(second.auth)
      .expect(200);
    const invitedRows = inbox.body.data.members as {
      attorneyId: string;
      status: string;
    }[];
    expect(invitedRows.find((m) => m.attorneyId === second.id)?.status).toBe(
      'invited',
    );
    await api().post('/api/v1/firms/me/accept').set(second.auth).expect(200);

    page = await api()
      .get(`/api/v1/firms/${firmId}`)
      .set(owner.auth)
      .expect(200);
    expect(page.body.data.members).toHaveLength(2);
    expect(page.body.data.states).toEqual(['IL', 'NJ']);
  });

  it('only the owner invites; a lawyer can be in one firm; leaving works', async () => {
    const owner = await lawyer('NJ');
    const m = await lawyer('NJ');
    const other = await lawyer('NJ');
    await api()
      .post('/api/v1/firms')
      .set(owner.auth)
      .send({ name: 'Firm A' })
      .expect(201);
    await api()
      .post('/api/v1/firms/me/members')
      .set(owner.auth)
      .send({ username: m.username })
      .expect(200);
    await api().post('/api/v1/firms/me/accept').set(m.auth).expect(200);

    await api()
      .post('/api/v1/firms/me/members')
      .set(m.auth)
      .send({ username: other.username })
      .expect(403);
    await api()
      .post('/api/v1/firms')
      .set(other.auth)
      .send({ name: 'Firm B' })
      .expect(201);
    const dup = await api()
      .post('/api/v1/firms/me/members')
      .set(owner.auth)
      .send({ username: other.username });
    expect(dup.status).toBe(409);

    await api()
      .delete(`/api/v1/firms/me/members/${m.id}`)
      .set(m.auth)
      .expect(204);
    await api().get('/api/v1/firms/me').set(m.auth).expect(404);
  });

  it('a case is matched to the members whose licence fits its state', async () => {
    const owner = await lawyer('NJ');
    const il = await lawyer('IL');
    await api()
      .post('/api/v1/firms')
      .set(owner.auth)
      .send({ name: 'Firm C' })
      .expect(201);
    await api()
      .post('/api/v1/firms/me/members')
      .set(owner.auth)
      .send({ username: il.username })
      .expect(200);
    await api().post('/api/v1/firms/me/accept').set(il.auth).expect(200);

    const client = await prisma.user.create({ data: { role: 'client' } });
    const pa = await prisma.practiceArea.upsert({
      where: { code: 'firm_test_area' },
      create: {
        code: 'firm_test_area',
        name_en: 'E2E firm',
        i18n_key: 'practice.firm_test',
        sort: 1,
      },
      update: {},
    });
    const c = await prisma.case.create({
      data: {
        client_id: client.id,
        title: 'Lease dispute in Chicago',
        description: 'A landlord keeps the deposit after the lease ended.',
        practice_area_id: pa.id,
        primary_state_code: 'IL',
        budget_mode: 'clarify_later',
        status: 'open',
      },
    });
    await prisma.caseState.create({
      data: { case_id: c.id, state_code: 'IL', is_primary: true },
    });
    const res = await api()
      .get(`/api/v1/firms/me/cases/${c.id}/eligible`)
      .set(owner.auth)
      .expect(200);
    const fit = res.body.data as { attorneyId: string }[];
    expect(fit.map((x) => x.attorneyId)).toEqual([il.id]);

    await prisma.attorneyPracticeArea.create({
      data: { attorney_id: il.id, practice_area_id: pa.id },
    });
    const body = {
      feeType: 'fixed',
      amountCents: 50_000,
      message: 'Happy to help with this lease dispute, I can start right away.',
      startAvailability: 'immediately',
    };
    // The NJ-only owner cannot send it as himself on behalf of the NJ
    // licence: only the IL lawyer fits this case.
    const stranger = await lawyer('NJ');
    const refused = await api()
      .post(`/api/v1/cases/${c.id}/bids`)
      .set(owner.auth)
      .set('Idempotency-Key', randomUUID())
      .send({ ...body, sendAsAttorneyId: stranger.id });
    expect(refused.status).toBe(403);
    // The IL lawyer fits: the bid runs as them (their plan decides next).
    const asIl = await api()
      .post(`/api/v1/cases/${c.id}/bids`)
      .set(owner.auth)
      .set('Idempotency-Key', randomUUID())
      .send({ ...body, sendAsAttorneyId: il.id });
    expect(asIl.body.error?.code).toBe('SUBSCRIPTION_REQUIRED');
    expect(asIl.body.error?.message).toContain('subscription');

    // The firm shows on the lawyer's public profile.
    const prof = await api()
      .get(`/api/v1/attorneys/${il.username}`)
      .set(owner.auth)
      .expect(200);
    const shown = prof.body.data as { firm: { name: string } | null };
    expect(shown.firm?.name).toBe('Firm C');
  });

  // Firms audit 16.11 (PR-1, rest of row 167): the bid records who really
  // sent it and the member it went out for is told.
  it('the owner sends a bid as a member: sent_by is the owner, the member is notified', async () => {
    const owner = await lawyer('NJ');
    const il = await lawyer('IL');
    await prisma.subscription.create({
      data: { user_id: il.id, status: 'active', price_cents: 39900 },
    });
    await api()
      .post('/api/v1/firms')
      .set(owner.auth)
      .send({ name: 'Firm S' })
      .expect(201);
    await api()
      .post('/api/v1/firms/me/members')
      .set(owner.auth)
      .send({ username: il.username })
      .expect(200);
    await api().post('/api/v1/firms/me/accept').set(il.auth).expect(200);
    const client = await prisma.user.create({ data: { role: 'client' } });
    const pa = await prisma.practiceArea.upsert({
      where: { code: 'firm_test_area' },
      create: {
        code: 'firm_test_area',
        name_en: 'E2E firm',
        i18n_key: 'practice.firm_test',
        sort: 1,
      },
      update: {},
    });
    await prisma.attorneyPracticeArea.create({
      data: { attorney_id: il.id, practice_area_id: pa.id },
    });
    const c = await prisma.case.create({
      data: {
        client_id: client.id,
        title: 'Security deposit kept in Chicago',
        description: 'The landlord keeps the whole deposit after move-out.',
        practice_area_id: pa.id,
        primary_state_code: 'IL',
        budget_mode: 'clarify_later',
        status: 'open',
      },
    });
    await prisma.caseState.create({
      data: { case_id: c.id, state_code: 'IL', is_primary: true },
    });
    const sent = await api()
      .post(`/api/v1/cases/${c.id}/bids`)
      .set(owner.auth)
      .set('Idempotency-Key', randomUUID())
      .send({
        feeType: 'fixed',
        amountCents: 50_000,
        message: 'Our firm handles deposit disputes in Illinois every week.',
        startAvailability: 'immediately',
        sendAsAttorneyId: il.id,
      });
    expect(sent.status).toBe(201);
    const bidId = sent.body.data.id as string;
    const row = await shardContext.runForCase(c.id, () =>
      prisma.bid.findUnique({
        where: { id: bidId },
        select: { attorney_id: true, sent_by: true },
      }),
    );
    expect(row).toEqual({ attorney_id: il.id, sent_by: owner.id });

    const inbox = await api()
      .get('/api/v1/notifications')
      .set(il.auth)
      .expect(200);
    const rows = inbox.body.data as {
      type: string;
      payload: Record<string, unknown>;
    }[];
    const note = rows.find((n) => n.type === 'firm_update');
    expect(note?.payload).toMatchObject({
      kind: 'bid_sent_for_you',
      bidId,
      caseId: c.id,
      actorId: owner.id,
    });
    // The owner is not told about his own bid.
    const ownerInbox = await api()
      .get('/api/v1/notifications')
      .set(owner.auth)
      .expect(200);
    expect(
      (ownerInbox.body.data as { type: string }[]).some(
        (n) => n.type === 'firm_update',
      ),
    ).toBe(false);
  });

  it('a bid of my own records me as the sender and notifies no firm member', async () => {
    const me = await lawyer('NJ');
    await prisma.subscription.create({
      data: { user_id: me.id, status: 'active', price_cents: 39900 },
    });
    const client = await prisma.user.create({ data: { role: 'client' } });
    const pa = await prisma.practiceArea.upsert({
      where: { code: 'firm_test_area' },
      create: {
        code: 'firm_test_area',
        name_en: 'E2E firm',
        i18n_key: 'practice.firm_test',
        sort: 1,
      },
      update: {},
    });
    await prisma.attorneyPracticeArea.create({
      data: { attorney_id: me.id, practice_area_id: pa.id },
    });
    const c = await prisma.case.create({
      data: {
        client_id: client.id,
        title: 'Speeding ticket near Newark',
        description: 'A ticket on the turnpike, I want to contest it.',
        practice_area_id: pa.id,
        primary_state_code: 'NJ',
        budget_mode: 'clarify_later',
        status: 'open',
      },
    });
    await prisma.caseState.create({
      data: { case_id: c.id, state_code: 'NJ', is_primary: true },
    });
    const sent = await api()
      .post(`/api/v1/cases/${c.id}/bids`)
      .set(me.auth)
      .set('Idempotency-Key', randomUUID())
      .send({
        feeType: 'fixed',
        amountCents: 40_000,
        message: 'I contest New Jersey tickets every week, happy to help.',
        startAvailability: 'immediately',
      })
      .expect(201);
    const row = await shardContext.runForCase(c.id, () =>
      prisma.bid.findUnique({
        where: { id: sent.body.data.id as string },
        select: { sent_by: true },
      }),
    );
    expect(row?.sent_by).toBe(me.id);
    const inbox = await api().get('/api/v1/notifications').set(me.auth);
    expect(
      (inbox.body.data as { type: string }[]).some(
        (n) => n.type === 'firm_update',
      ),
    ).toBe(false);
  });

  // Firms audit 16.11 (PR-2): ownership moves, the owner leaves only after
  // handing over, closing tells everyone, an erased owner hands over.
  async function firmWith(
    name: string,
    owner: { auth: Record<string, string> },
    ...members: { username: string; auth: Record<string, string> }[]
  ): Promise<string> {
    const made = await api()
      .post('/api/v1/firms')
      .set(owner.auth)
      .send({ name })
      .expect(201);
    for (const m of members) {
      await api()
        .post('/api/v1/firms/me/members')
        .set(owner.auth)
        .send({ username: m.username })
        .expect(200);
      await api().post('/api/v1/firms/me/accept').set(m.auth).expect(200);
    }
    return made.body.data.id as string;
  }

  async function firmNotes(who: { auth: Record<string, string> }) {
    const res = await api()
      .get('/api/v1/notifications')
      .set(who.auth)
      .expect(200);
    return (
      res.body.data as { type: string; payload: Record<string, unknown> }[]
    )
      .filter((n) => n.type === 'firm_update')
      .map((n) => n.payload);
  }

  it('the owner hands the firm to a member, stays as a member and can then leave', async () => {
    const owner = await lawyer('NJ');
    const m = await lawyer('NJ');
    const firmId = await firmWith('Hand Over LLP', owner, m);

    // Not to a stranger, not to himself.
    const stranger = await lawyer('NJ');
    await api()
      .post('/api/v1/firms/me/owner')
      .set(owner.auth)
      .send({ attorneyId: stranger.id })
      .expect(404);
    await api()
      .post('/api/v1/firms/me/owner')
      .set(owner.auth)
      .send({ attorneyId: owner.id })
      .expect(400);
    // A plain member cannot hand it over.
    await api()
      .post('/api/v1/firms/me/owner')
      .set(m.auth)
      .send({ attorneyId: owner.id })
      .expect(403);

    const moved = await api()
      .post('/api/v1/firms/me/owner')
      .set(owner.auth)
      .send({ attorneyId: m.id })
      .expect(200);
    expect(moved.body.data.ownerId).toBe(m.id);
    const roles = Object.fromEntries(
      (moved.body.data.members as { attorneyId: string; role: string }[]).map(
        (x) => [x.attorneyId, x.role],
      ),
    );
    expect(roles).toEqual({ [owner.id]: 'member', [m.id]: 'owner' });
    expect(await firmNotes(m)).toContainEqual(
      expect.objectContaining({
        kind: 'owner_transferred',
        firmId,
        actorId: owner.id,
      }),
    );
    // The former owner is a member now and leaves like one.
    await api()
      .delete(`/api/v1/firms/me/members/${owner.id}`)
      .set(owner.auth)
      .expect(204);
    await api().get('/api/v1/firms/me').set(owner.auth).expect(404);
    const left = await api().get('/api/v1/firms/me').set(m.auth).expect(200);
    expect(left.body.data.ownerId).toBe(m.id);
  });

  it('the owner leaves only after handing over; alone, leaving closes the firm', async () => {
    const owner = await lawyer('NJ');
    const m = await lawyer('NJ');
    await firmWith('Stay LLP', owner, m);
    const refused = await api()
      .delete(`/api/v1/firms/me/members/${owner.id}`)
      .set(owner.auth);
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('FIRM_OWNER_MUST_TRANSFER');
    await api().get('/api/v1/firms/me').set(m.auth).expect(200);

    const solo = await lawyer('NJ');
    const invited = await lawyer('NJ');
    await api()
      .post('/api/v1/firms')
      .set(solo.auth)
      .send({ name: 'Solo LLP' })
      .expect(201);
    await api()
      .post('/api/v1/firms/me/members')
      .set(solo.auth)
      .send({ username: invited.username })
      .expect(200);
    await api()
      .delete(`/api/v1/firms/me/members/${solo.id}`)
      .set(solo.auth)
      .expect(204);
    await api().get('/api/v1/firms/me').set(solo.auth).expect(404);
    await api().get('/api/v1/firms/me').set(invited.auth).expect(404);
    expect(await firmNotes(invited)).toContainEqual(
      expect.objectContaining({ kind: 'closed' }),
    );
  });

  it('closing the firm removes it for everyone and tells each lawyer', async () => {
    const owner = await lawyer('NJ');
    const a = await lawyer('NJ');
    const b = await lawyer('IL');
    const firmId = await firmWith('Closing LLP', owner, a, b);
    await api().delete('/api/v1/firms/me').set(a.auth).expect(403);
    await api().delete('/api/v1/firms/me').set(owner.auth).expect(204);
    for (const who of [owner, a, b]) {
      await api().get('/api/v1/firms/me').set(who.auth).expect(404);
    }
    await api().get(`/api/v1/firms/${firmId}`).set(a.auth).expect(404);
    for (const who of [a, b]) {
      expect(await firmNotes(who)).toContainEqual(
        expect.objectContaining({ kind: 'closed', firmId, actorId: owner.id }),
      );
    }
    expect(await firmNotes(owner)).toEqual([]);
    // Everyone is free to start or join another firm.
    await api()
      .post('/api/v1/firms')
      .set(a.auth)
      .send({ name: 'After LLP' })
      .expect(201);
  });

  it('an erased owner hands the firm to the longest-standing member, else it closes', async () => {
    const owner = await lawyer('NJ');
    const first = await lawyer('NJ');
    const later = await lawyer('NJ');
    const firmId = await firmWith('Heir LLP', owner, first, later);
    await prisma.firmMember.update({
      where: { attorney_id: later.id },
      data: { created_at: new Date(Date.now() + 60_000) },
    });
    // The real account erasure of the owner.
    expect(await app.get(AccountAnonymizationService).anonymize(owner.id)).toBe(
      true,
    );
    const firms = app.get(FirmsService);
    const firm = await prisma.firm.findUnique({
      where: { id: firmId },
      include: { members: true },
    });
    expect(firm?.owner_id).toBe(first.id);
    expect(firm?.members.map((x) => x.attorney_id).sort()).toEqual(
      [first.id, later.id].sort(),
    );
    expect(firm?.members.find((x) => x.attorney_id === first.id)?.role).toBe(
      'owner',
    );
    expect(await firmNotes(first)).toContainEqual(
      expect.objectContaining({ kind: 'owner_transferred', firmId }),
    );
    // A plain member erased just leaves.
    await firms.onAccountErased(later.id);
    expect(
      await prisma.firmMember.findUnique({ where: { attorney_id: later.id } }),
    ).toBeNull();
    // The last lawyer erased closes the firm.
    await firms.onAccountErased(first.id);
    expect(await prisma.firm.findUnique({ where: { id: firmId } })).toBeNull();
  });

  // Firms audit 16.11 (PR-3): invitations have their own table, tell the
  // lawyer, expire, never block other firms, and the firm size is a setting.
  async function setSetting(key: string, value: number | null) {
    if (value === null) {
      await prisma.appConfig.deleteMany({ where: { key } });
    } else {
      await prisma.appConfig.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      });
    }
    // AppConfigService caches the whole table in Redis for 30 s.
    await app.get<Redis>(REDIS_CLIENT).del('config:app_config');
  }

  it('an invitation tells the lawyer and is valid for the set number of days', async () => {
    const owner = await lawyer('NJ');
    const x = await lawyer('NJ');
    const made = await api()
      .post('/api/v1/firms')
      .set(owner.auth)
      .send({ name: 'Invite LLP' })
      .expect(201);
    const firmId = made.body.data.id as string;
    await setSetting('firms.invite_expiry_days', 3);
    try {
      await api()
        .post('/api/v1/firms/me/members')
        .set(owner.auth)
        .send({ username: x.username })
        .expect(200);
    } finally {
      await setSetting('firms.invite_expiry_days', null);
    }
    expect(await firmNotes(x)).toContainEqual(
      expect.objectContaining({ kind: 'invite', firmId, actorId: owner.id }),
    );
    const mine = await api().get('/api/v1/firms/me').set(x.auth).expect(200);
    expect(mine.body.data.id).toBe(firmId);
    const until = Date.parse(mine.body.data.inviteExpiresAt as string);
    expect(until - Date.now()).toBeGreaterThan(2.9 * 86_400_000);
    expect(until - Date.now()).toBeLessThan(3.1 * 86_400_000);
    // The owner sees the invitation among the lawyers; no expiry of his own.
    const own = await api().get('/api/v1/firms/me').set(owner.auth).expect(200);
    expect(own.body.data.inviteExpiresAt).toBeNull();
    expect(
      (own.body.data.members as { attorneyId: string; status: string }[]).find(
        (m) => m.attorneyId === x.id,
      )?.status,
    ).toBe('invited');

    // Expired: gone from «Моя фирма», cannot be accepted, can be renewed.
    await prisma.firmInvitation.update({
      where: { firm_id_attorney_id: { firm_id: firmId, attorney_id: x.id } },
      data: { expires_at: new Date(Date.now() - 1000) },
    });
    await api().get('/api/v1/firms/me').set(x.auth).expect(404);
    await api().post('/api/v1/firms/me/accept').set(x.auth).expect(404);
    await api()
      .post('/api/v1/firms/me/members')
      .set(owner.auth)
      .send({ username: x.username })
      .expect(200);
    await api().post('/api/v1/firms/me/accept').set(x.auth).expect(200);
  });

  it('a pending invitation blocks nothing: other firms invite, the lawyer picks one or starts his own', async () => {
    const a = await lawyer('NJ');
    const b = await lawyer('NJ');
    const y = await lawyer('NJ');
    const firmA = await firmWith('Alpha LLP', a);
    const firmB = await firmWith('Beta LLP', b);
    for (const owner of [a, b]) {
      await api()
        .post('/api/v1/firms/me/members')
        .set(owner.auth)
        .send({ username: y.username })
        .expect(200);
    }
    // «Моя фирма» shows the newest invitation; accepting names the other.
    const shown = await api().get('/api/v1/firms/me').set(y.auth).expect(200);
    expect(shown.body.data.id).toBe(firmB);
    const joined = await api()
      .post('/api/v1/firms/me/accept')
      .set(y.auth)
      .send({ firmId: firmA })
      .expect(200);
    expect(joined.body.data.id).toBe(firmA);
    // One firm at a time: the other invitation is gone.
    expect(
      await prisma.firmInvitation.count({ where: { attorney_id: y.id } }),
    ).toBe(0);
    const bView = await api().get('/api/v1/firms/me').set(b.auth).expect(200);
    expect(
      (bView.body.data.members as { attorneyId: string }[]).some(
        (m) => m.attorneyId === y.id,
      ),
    ).toBe(false);

    // Invited, the lawyer may still start his own firm.
    const z = await lawyer('NJ');
    await api()
      .post('/api/v1/firms/me/members')
      .set(a.auth)
      .send({ username: z.username })
      .expect(200);
    await api()
      .post('/api/v1/firms')
      .set(z.auth)
      .send({ name: 'Zed LLP' })
      .expect(201);
    const late = await api().post('/api/v1/firms/me/accept').set(z.auth);
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('FIRM_ALREADY_MEMBER');
  });

  it('declining drops the invitation; the owner can withdraw one', async () => {
    const owner = await lawyer('NJ');
    const d = await lawyer('NJ');
    const w = await lawyer('NJ');
    const firmId = await firmWith('Decline LLP', owner);
    for (const who of [d, w]) {
      await api()
        .post('/api/v1/firms/me/members')
        .set(owner.auth)
        .send({ username: who.username })
        .expect(200);
    }
    await api()
      .delete(`/api/v1/firms/me/members/${d.id}`)
      .set(d.auth)
      .expect(204);
    await api().get('/api/v1/firms/me').set(d.auth).expect(404);
    await api()
      .delete(`/api/v1/firms/me/members/${w.id}`)
      .set(owner.auth)
      .expect(204);
    await api().get('/api/v1/firms/me').set(w.auth).expect(404);
    expect(
      await prisma.firmInvitation.count({ where: { firm_id: firmId } }),
    ).toBe(0);
  });

  it('the firm size is the admin setting, invitations included', async () => {
    const owner = await lawyer('NJ');
    const p = await lawyer('NJ');
    const q = await lawyer('NJ');
    await firmWith('Small LLP', owner);
    await setSetting('firms.max_members', 2);
    try {
      await api()
        .post('/api/v1/firms/me/members')
        .set(owner.auth)
        .send({ username: p.username })
        .expect(200);
      const full = await api()
        .post('/api/v1/firms/me/members')
        .set(owner.auth)
        .send({ username: q.username });
      expect(full.status).toBe(409);
      expect(full.body.error.code).toBe('FIRM_FULL');
      // Inviting the same lawyer again only renews the invitation.
      await api()
        .post('/api/v1/firms/me/members')
        .set(owner.auth)
        .send({ username: p.username })
        .expect(200);
    } finally {
      await setSetting('firms.max_members', null);
    }
  });

  it('a legacy invited row (before firm_invitations) blocks nothing', async () => {
    const owner = await lawyer('NJ');
    const old = await lawyer('NJ');
    const firmId = await firmWith('Legacy LLP', owner);
    await prisma.firmMember.create({
      data: { firm_id: firmId, attorney_id: old.id, status: 'invited' },
    });
    await api().get('/api/v1/firms/me').set(old.auth).expect(404);
    const own = await api().get('/api/v1/firms/me').set(owner.auth).expect(200);
    expect(own.body.data.members).toHaveLength(1);
    await api()
      .post('/api/v1/firms')
      .set(old.auth)
      .send({ name: 'Fresh LLP' })
      .expect(201);
  });

  it('is off behind the flag: every firm route refuses', async () => {
    const owner = await lawyer('NJ');
    const m = await lawyer('NJ');
    const made = await api()
      .post('/api/v1/firms')
      .set(owner.auth)
      .send({ name: 'Firm Off' })
      .expect(201);
    await api()
      .post('/api/v1/firms/me/members')
      .set(owner.auth)
      .send({ username: m.username })
      .expect(200);
    await prisma.featureFlag.update({
      where: { key: 'firm_profiles' },
      data: { enabled: false },
    });
    try {
      const a = await lawyer('NJ');
      const calls = [
        api().post('/api/v1/firms').set(a.auth).send({ name: 'Nope' }),
        api().get('/api/v1/firms/me').set(owner.auth),
        api()
          .get(`/api/v1/firms/${made.body.data.id as string}`)
          .set(a.auth),
        api().post('/api/v1/firms/me/accept').set(m.auth),
        api().delete(`/api/v1/firms/me/members/${m.id}`).set(m.auth),
        api()
          .post('/api/v1/firms/me/members')
          .set(owner.auth)
          .send({ username: a.username }),
        api()
          .get(`/api/v1/firms/me/cases/${randomUUID()}/eligible`)
          .set(owner.auth),
        api()
          .post('/api/v1/firms/me/owner')
          .set(owner.auth)
          .send({ attorneyId: m.id }),
        api().delete('/api/v1/firms/me').set(owner.auth),
      ];
      for (const r of await Promise.all(calls)) {
        expect(r.status).toBe(409);
        expect(r.body.error.code).toBe('FEATURE_DISABLED');
      }
    } finally {
      await prisma.featureFlag.update({
        where: { key: 'firm_profiles' },
        data: { enabled: true },
      });
    }
  });
});
