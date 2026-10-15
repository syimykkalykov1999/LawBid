import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { ensurePostPractices } from './support/post-practices';

/**
 * Owner 2026-10-15: a case names up to `case.max_practices` topics (the
 * first in cases.practice_area_id, the rest in case_extra_practices); the
 * attorneys of any of them see it. «Mine»: «Completed» holds closed and
 * archived cases and the finished bids.
 */
jest.setTimeout(60_000);

describe('Case topics and Mine «Completed» (e2e, owner 2026-10-15)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let baseUrl = '';

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
    baseUrl = `http://127.0.0.1:${((app.getHttpServer() as Server).address() as AddressInfo).port}`;
    prisma = app.get(PrismaService);
    await ensurePostPractices(prisma);
    await prisma.state.upsert({
      where: { code: 'NY' },
      create: { code: 'NY', name: 'New York' },
      update: {},
    });
    tokens = app.get(TokenService);
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(baseUrl);

  async function user(role: 'client' | 'attorney', verified = true) {
    const u = await prisma.user.create({
      data: { role, phone_verified_at: role === 'client' ? new Date() : null },
    });
    if (role === 'client') {
      const handle = `cl_${u.id.slice(0, 8)}`;
      await prisma.clientProfile.create({
        data: {
          user_id: u.id,
          state_code: 'NY',
          preferred_languages: ['en'],
          username: handle,
          username_lower: handle,
        },
      });
    }
    if (role === 'attorney') {
      const username = `att_${u.id.slice(0, 8)}`;
      await prisma.attorneyProfile.create({
        data: {
          user_id: u.id,
          username,
          username_lower: username,
          languages: ['en'],
          verification_status: verified ? 'verified' : 'unverified',
        },
      });
    }
    const token = tokens.signAccessToken({
      sub: u.id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney' && verified,
      subscriptionStatus: 'none',
    });
    return { id: u.id, auth: { Authorization: `Bearer ${token}` } };
  }

  async function mkCase(
    clientId: string,
    title: string,
    code: string,
    status: 'open' | 'in_progress' = 'open',
  ) {
    const a = await prisma.practiceArea.findUniqueOrThrow({ where: { code } });
    const c = await prisma.case.create({
      data: {
        client_id: clientId,
        title,
        description: 'A description long enough for the case.',
        practice_area_id: a.id,
        primary_state_code: 'NY',
        budget_mode: 'clarify_later',
        status,
      },
    });
    await prisma.caseState.create({
      data: { case_id: c.id, state_code: 'NY', is_primary: true },
    });
    return c.id;
  }

  const ids = (r: request.Response) =>
    (r.body.data as { id: string }[]).map((x) => x.id);

  const area = (code: string) =>
    prisma.practiceArea.findUniqueOrThrow({ where: { code } });

  async function licensed(attorneyId: string, code: string) {
    await prisma.subscription.create({
      data: { user_id: attorneyId, status: 'active', price_cents: 39900 },
    });
    await prisma.attorneyLicense.create({
      data: {
        attorney_id: attorneyId,
        state_code: 'NY',
        bar_number: `NY-${randomUUID()}`,
        license_status: 'verified',
      },
    });
    await prisma.attorneyPracticeArea.create({
      data: {
        attorney_id: attorneyId,
        practice_area_id: (await area(code)).id,
      },
    });
  }

  function postCase(
    auth: Record<string, string>,
    primary: string,
    extra: string[],
  ) {
    return api()
      .post('/api/v1/cases')
      .set(auth)
      .set('Idempotency-Key', randomUUID())
      .send({
        practiceAreaId: primary,
        extraPracticeAreaIds: extra,
        title: 'Several topics in one case',
        description:
          'Another driver hit my car at a red light and the insurer refuses to pay for repairs.',
        primaryStateCode: 'NY',
        budgetMode: 'clarify_later',
        clientContactSharingConsent: true,
      });
  }

  it('stores up to three topics; attorneys of any topic see the case', async () => {
    const cli = await user('client');
    await prisma.user.update({
      where: { id: cli.id },
      data: {
        first_name: 'Anna',
        last_name: 'Kowalski',
        email_verified_at: new Date(),
      },
    });
    await prisma.onboardingState.create({
      data: { user_id: cli.id, completed_at: new Date() },
    });
    const root = await area('civil_litigation');
    const tag = randomUUID().slice(0, 8);
    const [family, sub, third, fourth] = await Promise.all(
      [1, 2, 3, 4].map((n) =>
        prisma.practiceArea.create({
          data: {
            parent_id: root.id,
            code: `civil_litigation.topic_${tag}_${n}`,
            name_en: `Topic ${n}`,
            i18n_key: `practice.civil_litigation.topic_${tag}_${n}`,
            sort: 900 + n,
          },
        }),
      ),
    );
    const tooMany = await postCase(cli.auth, family.id, [
      sub.id,
      third.id,
      fourth.id,
    ]);
    expect(tooMany.status).toBe(400);

    const ok = await postCase(cli.auth, family.id, [sub.id, sub.id]);
    expect(ok.status).toBe(201);
    expect(ok.body.data.practiceArea.id).toBe(family.id);
    expect(
      (ok.body.data.extraPracticeAreas as { id: string }[]).map((x) => x.id),
    ).toEqual([sub.id]);
    const caseId = ok.body.data.id as string;

    // Visible to an attorney of the SECOND topic only.
    const att = await user('attorney');
    await licensed(att.id, sub.code);
    const feed = await api().get('/api/v1/cases').set(att.auth);
    expect(ids(feed)).toContain(caseId);
    const item = (
      feed.body.data as { id: string; extraPracticeCount: number }[]
    ).find((x) => x.id === caseId);
    expect(item?.extraPracticeCount).toBe(1);
    const detail = await api().get(`/api/v1/cases/${caseId}`).set(att.auth);
    expect(detail.body.data.inMyPractice).toBe(true);

    // The client edits the topics (no bids yet): one topic again.
    const edited = await api()
      .patch(`/api/v1/cases/${caseId}`)
      .set(cli.auth)
      .send({ extraPracticeAreaIds: [] });
    expect(edited.status).toBe(200);
    expect(edited.body.data.extraPracticeAreas).toEqual([]);
    const gone = await api().get('/api/v1/cases').set(att.auth);
    expect(ids(gone)).not.toContain(caseId);

    const mine = await api()
      .get('/api/v1/users/me/cases?filter=open')
      .set(cli.auth);
    expect(
      (mine.body.data as { id: string; extraPracticeCount: number }[]).find(
        (x) => x.id === caseId,
      )?.extraPracticeCount,
    ).toBe(0);
  });

  it('«Completed» holds closed and archived cases and the finished bids', async () => {
    const cli = await user('client');
    const att = await user('attorney');
    const a = await mkCase(cli.id, 'Open one', 'family_law');
    const b = await mkCase(cli.id, 'Closed one', 'family_law');
    const c = await mkCase(cli.id, 'Archived one', 'family_law');
    await prisma.case.update({ where: { id: b }, data: { status: 'closed' } });
    await prisma.case.update({
      where: { id: c },
      data: { status: 'archived' },
    });
    const done = await api()
      .get('/api/v1/users/me/cases?filter=completed')
      .set(cli.auth);
    expect(ids(done).sort()).toEqual([b, c].sort());

    const mkBid = (caseId: string, status: string) =>
      prisma.bid.create({
        data: {
          case_id: caseId,
          attorney_id: att.id,
          status: status as 'active',
          fee_type: 'fixed',
          amount_cents: 100000,
          message: 'My bid',
          start_availability: 'immediately',
          turn: 'client',
        },
      });
    const bidOpen = await mkBid(a, 'active');
    const bidClosed = await mkBid(b, 'accepted');
    const bidRejected = await mkBid(c, 'rejected_by_client');
    const running = await mkCase(
      cli.id,
      'Running',
      'family_law',
      'in_progress',
    );
    const bidRunning = await mkBid(running, 'accepted');
    const list = await api()
      .get('/api/v1/users/me/bids?filter=completed')
      .set(att.auth);
    expect(list.status).toBe(200);
    expect(ids(list).sort()).toEqual([bidClosed.id, bidRejected.id].sort());
    expect(ids(list)).not.toContain(bidOpen.id);
    expect(ids(list)).not.toContain(bidRunning.id);
  });
});
