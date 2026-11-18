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
import { FeatureFlagsService } from '../src/modules/feature-flags/feature-flags.public';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { shardContext } from '../src/sharding/shard-context';
import { dropAppConfigCache } from '../src/modules/feature-flags/services/app-config.service';

/**
 * Firms audit 16.11 (PR-5, owner): a lawyer who joined a colleague's bid
 * (POST /bids/:id/join) works on it like a shared matter team in Clio /
 * MyCase — reads and writes in the bid's chat, opens the case and its
 * workspace once the bid is accepted, and loses all of it on leaving the
 * firm. The client sees the team's names on the bid. Behind `firm_profiles`.
 */
jest.setTimeout(120_000);

describe('Firm team on a bid (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let redis: Redis;
  let flags: FeatureFlagsService;
  let base = '';
  // KE 94: shared switches go back to what they were before this suite.
  let dealRecordBefore: { value: unknown } | null = null;
  let firmsBefore: { enabled: boolean } | null = null;

  async function setFlag(enabled: boolean) {
    await prisma.featureFlag.upsert({
      where: { key: 'firm_profiles' },
      create: { key: 'firm_profiles', enabled, description: 'e2e' },
      update: { enabled },
    });
    await flags.invalidate();
  }

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
    redis = app.get<Redis>(REDIS_CLIENT);
    flags = app.get(FeatureFlagsService);
    await prisma.state.upsert({
      where: { code: 'IL' },
      create: { code: 'IL', name: 'IL', is_active: true },
      update: {},
    });
    dealRecordBefore = await prisma.appConfig.findUnique({
      where: { key: 'deal_record.enabled' },
      select: { value: true },
    });
    firmsBefore = await prisma.featureFlag.findUnique({
      where: { key: 'firm_profiles' },
      select: { enabled: true },
    });
    // The plain accept (the deal-record path calls the same acceptInTx).
    await prisma.appConfig.upsert({
      where: { key: 'deal_record.enabled' },
      create: { key: 'deal_record.enabled', value: false },
      update: { value: false },
    });
    await dropAppConfigCache(redis);
    await setFlag(true);
  });

  afterAll(async () => {
    await setFlag(firmsBefore?.enabled ?? false);
    if (dealRecordBefore) {
      await prisma.appConfig.update({
        where: { key: 'deal_record.enabled' },
        data: { value: dealRecordBefore.value as never },
      });
    } else {
      await prisma.appConfig.deleteMany({
        where: { key: 'deal_record.enabled' },
      });
    }
    await dropAppConfigCache(redis);
    await app.close();
  });

  const api = () => request(base);
  const auth = (id: string, role: 'attorney' | 'client') => ({
    Authorization: `Bearer ${tokens.signAccessToken({
      sub: id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    })}`,
  });

  async function lawyer(last: string) {
    const u = await prisma.user.create({
      data: { role: 'attorney', first_name: 'Team', last_name: last },
    });
    const username = `t${u.id.slice(0, 8)}`;
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
        state_code: 'IL',
        bar_number: `T${randomUUID().slice(0, 8)}`,
        license_status: 'verified',
      },
    });
    await prisma.subscription.create({
      data: { user_id: u.id, status: 'active', price_cents: 39900 },
    });
    const pa = await prisma.practiceArea.upsert({
      where: { code: 'firm_team_area' },
      create: {
        code: 'firm_team_area',
        name_en: 'E2E firm team',
        i18n_key: 'practice.firm_team',
        sort: 1,
      },
      update: {},
    });
    await prisma.attorneyPracticeArea.create({
      data: { attorney_id: u.id, practice_area_id: pa.id },
    });
    return { id: u.id, username, auth: auth(u.id, 'attorney') };
  }

  async function client() {
    const u = await prisma.user.create({
      data: {
        role: 'client',
        first_name: 'Anna',
        last_name: 'Client',
        email: `c_${randomUUID().slice(0, 8)}@example.com`,
        phone_e164: `+1312${Math.floor(2_000_000 + Math.random() * 7_999_999)}`,
        phone_verified_at: new Date(),
      },
    });
    const handle = `c_${u.id.slice(0, 8)}`;
    await prisma.clientProfile.create({
      data: {
        user_id: u.id,
        state_code: 'IL',
        preferred_languages: ['en'],
        username: handle,
        username_lower: handle,
      },
    });
    return { id: u.id, auth: auth(u.id, 'client') };
  }

  async function openCase(clientId: string) {
    const pa = await prisma.practiceArea.findUniqueOrThrow({
      where: { code: 'firm_team_area' },
    });
    const c = await prisma.case.create({
      data: {
        client_id: clientId,
        title: 'Deposit not returned after the lease',
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
    return c.id;
  }

  async function firmWith(
    owner: { auth: Record<string, string> },
    ...members: { username: string; auth: Record<string, string> }[]
  ) {
    await api()
      .post('/api/v1/firms')
      .set(owner.auth)
      .send({ name: `Team ${randomUUID().slice(0, 6)}` })
      .expect(201);
    for (const m of members) {
      await api()
        .post('/api/v1/firms/me/members')
        .set(owner.auth)
        .send({ username: m.username })
        .expect(200);
      await api().post('/api/v1/firms/me/accept').set(m.auth).expect(200);
    }
  }

  /** Lead + colleague in one firm (and a third lawyer of the firm who did
   * not join), the lead's bid on a client's case, the colleague joined. */
  async function setUp() {
    const lead = await lawyer('Lead');
    const mate = await lawyer('Mate');
    const idle = await lawyer('Idle');
    await firmWith(lead, mate, idle);
    const owner = await client();
    const caseId = await openCase(owner.id);
    const bid = await api()
      .post(`/api/v1/cases/${caseId}/bids`)
      .set(lead.auth)
      .set('Idempotency-Key', randomUUID())
      .send({
        feeType: 'fixed',
        amountCents: 45_000,
        message: 'We handle deposit disputes every week and can start today.',
        startAvailability: 'immediately',
      })
      .expect(201);
    const bidId = bid.body.data.id as string;
    // The lead opens the chat and writes first.
    const opened = await api()
      .post(`/api/v1/cases/${caseId}/conversation`)
      .set(lead.auth)
      .expect(200);
    const chatId = opened.body.data.conversationId as string;
    await send(lead, chatId, 'Hello from the firm.');
    await api().post(`/api/v1/bids/${bidId}/join`).set(mate.auth).expect(200);
    return { lead, mate, idle, owner, caseId, bidId, chatId };
  }

  const send = (
    who: { auth: Record<string, string> },
    chatId: string,
    body: string,
  ) =>
    api()
      .post(`/api/v1/conversations/${chatId}/messages`)
      .set(who.auth)
      .send({ clientMessageId: randomUUID(), body });

  const bodies = async (who: { auth: Record<string, string> }, id: string) => {
    const res = await api()
      .get(`/api/v1/conversations/${id}/messages`)
      .set(who.auth)
      .expect(200);
    return (res.body.data as { body: string }[]).map((m) => m.body);
  };

  it('a joined colleague reads and writes in the bid chat; others cannot', async () => {
    const { lead, mate, idle, owner, chatId, caseId } = await setUp();

    // «Message the client» on the case opens the firm bid's chat, not a new one.
    const opened = await api()
      .post(`/api/v1/cases/${caseId}/conversation`)
      .set(mate.auth)
      .expect(200);
    expect(opened.body.data.conversationId).toBe(chatId);

    expect(await bodies(mate, chatId)).toContain('Hello from the firm.');
    expect((await send(mate, chatId, 'A colleague here.')).status).toBe(201);
    expect(await bodies(owner, chatId)).toContain('A colleague here.');
    expect(await bodies(lead, chatId)).toContain('A colleague here.');

    // The chat is in the colleague's list.
    const list = await api()
      .get('/api/v1/conversations')
      .set(mate.auth)
      .expect(200);
    expect((list.body.data as { id: string }[]).map((c) => c.id)).toContain(
      chatId,
    );

    // A lawyer of the same firm who did not join, and a stranger: 404.
    const stranger = await lawyer('Stranger');
    for (const who of [idle, stranger]) {
      await api()
        .get(`/api/v1/conversations/${chatId}/messages`)
        .set(who.auth)
        .expect(404);
      expect((await send(who, chatId, 'Let me in')).status).toBe(404);
    }
  });

  it('after acceptance the colleague opens the case and its workspace; the client sees the team', async () => {
    const { lead, mate, idle, owner, caseId, bidId, chatId } = await setUp();

    // Before acceptance the workspace has no attorney side: 404 for the
    // colleague, as for the bid's own lawyer.
    for (const who of [mate, lead]) {
      await api()
        .get(`/api/v1/cases/${caseId}/workspace`)
        .set(who.auth)
        .expect(404);
    }

    await api()
      .post(`/api/v1/bids/${bidId}/accept`)
      .set(owner.auth)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(200);

    const ws = await api()
      .get(`/api/v1/cases/${caseId}/workspace`)
      .set(mate.auth)
      .expect(200);
    expect(ws.body.data.role).toBe('attorney');
    await api().get(`/api/v1/cases/${caseId}`).set(mate.auth).expect(200);

    // The colleague works on the attorney's side: an update reaches the client.
    await api()
      .post(`/api/v1/cases/${caseId}/updates`)
      .set(mate.auth)
      .send({ body: 'Filed the demand letter.', files: [] })
      .expect(201);
    const updates = await api()
      .get(`/api/v1/cases/${caseId}/updates`)
      .set(owner.auth)
      .expect(200);
    expect(
      (updates.body.data as { body: string; authorRole: string }[]).find(
        (u) => u.body === 'Filed the demand letter.',
      )?.authorRole,
    ).toBe('attorney');

    // The colleague got the attorney's acceptance news.
    const notes = await api()
      .get('/api/v1/notifications')
      .set(mate.auth)
      .expect(200);
    expect(
      (notes.body.data as { type: string; payload: { bidId?: string } }[]).some(
        (n) => n.type === 'bid_accepted' && n.payload.bidId === bidId,
      ),
    ).toBe(true);

    // The client sees who is on the firm's team (names only).
    const detail = await api()
      .get(`/api/v1/bids/${bidId}`)
      .set(owner.auth)
      .expect(200);
    expect(detail.body.data.team).toEqual([
      { id: mate.id, firstName: 'Team', lastName: 'Mate' },
    ]);

    // Still forbidden for the firm's lawyer who did not join.
    await api()
      .get(`/api/v1/cases/${caseId}/workspace`)
      .set(idle.auth)
      .expect(404);
    await api()
      .get(`/api/v1/conversations/${chatId}/messages`)
      .set(idle.auth)
      .expect(404);
    // The lead is unaffected.
    await api()
      .get(`/api/v1/cases/${caseId}/workspace`)
      .set(lead.auth)
      .expect(200);
  });

  it('leaving the firm takes the access away', async () => {
    const { mate, owner, caseId, bidId, chatId } = await setUp();
    await api()
      .post(`/api/v1/bids/${bidId}/accept`)
      .set(owner.auth)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(200);
    await api()
      .get(`/api/v1/cases/${caseId}/workspace`)
      .set(mate.auth)
      .expect(200);

    await api()
      .delete(`/api/v1/firms/me/members/${mate.id}`)
      .set(mate.auth)
      .expect(204);

    await api()
      .get(`/api/v1/conversations/${chatId}/messages`)
      .set(mate.auth)
      .expect(404);
    expect((await send(mate, chatId, 'Still here?')).status).toBe(404);
    await api()
      .get(`/api/v1/cases/${caseId}/workspace`)
      .set(mate.auth)
      .expect(404);
    await api().get(`/api/v1/cases/${caseId}`).set(mate.auth).expect(404);
    const list = await api()
      .get('/api/v1/conversations')
      .set(mate.auth)
      .expect(200);
    expect((list.body.data as { id: string }[]).map((c) => c.id)).not.toContain(
      chatId,
    );
    // The join and the chat seat are gone; the client no longer sees him.
    const rows = await shardContext.runForCase(caseId, () =>
      prisma.bidParticipant.findMany({ where: { bid_id: bidId } }),
    );
    expect(rows).toEqual([]);
    const detail = await api()
      .get(`/api/v1/bids/${bidId}`)
      .set(owner.auth)
      .expect(200);
    expect(detail.body.data.team).toEqual([]);
  });

  it('with the switch off a joined colleague has no access', async () => {
    const { mate, chatId, caseId } = await setUp();
    await setFlag(false);
    try {
      await api()
        .get(`/api/v1/conversations/${chatId}/messages`)
        .set(mate.auth)
        .expect(404);
      await api()
        .post(`/api/v1/cases/${caseId}/conversation`)
        .set(mate.auth)
        .expect(200)
        .expect((r) => expect(r.body.data.conversationId).not.toBe(chatId));
    } finally {
      await setFlag(true);
    }
  });
});
