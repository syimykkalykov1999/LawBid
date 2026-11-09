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
 * Owner 2026-11-09 («Дела → Активные»): the cases that show the stage
 * scale sort by it — the most advanced case first (wrapping up, in
 * progress, bids, new), the newest activity first inside a stage — on the
 * server, page after page; «Done» keeps its date order. The «По этапам»,
 * «Ждёт меня» and «Дата» filters narrow / reorder the same lists.
 */
jest.setTimeout(60_000);

describe('Cases sorted by stage (e2e, owner 2026-11-09)', () => {
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
  const auth = (id: string, role: 'client' | 'attorney') => ({
    Authorization: `Bearer ${tokens.signAccessToken({
      sub: id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    })}`,
  });

  async function client() {
    const u = await prisma.user.create({
      data: { role: 'client', phone_verified_at: new Date() },
    });
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
    return u.id;
  }

  async function attorney() {
    const u = await prisma.user.create({ data: { role: 'attorney' } });
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
    return u.id;
  }

  type Status =
    'open' | 'in_progress' | 'pending_completion' | 'disputed' | 'closed';

  /** A case created [daysAgo] days ago whose last activity was [activity]
   * days ago — the two orders (date vs stage) must differ to be tested. */
  async function mkCase(
    clientId: string,
    title: string,
    status: Status,
    opts: { bids?: number; daysAgo: number; activity: number },
  ) {
    const area = await prisma.practiceArea.findUniqueOrThrow({
      where: { code: 'family_law' },
    });
    const day = 24 * 3600 * 1000;
    const c = await prisma.case.create({
      data: {
        client_id: clientId,
        title,
        description: 'A description long enough for the case.',
        practice_area_id: area.id,
        primary_state_code: 'NY',
        budget_mode: 'clarify_later',
        status,
        bids_count: opts.bids ?? 0,
        created_at: new Date(Date.now() - opts.daysAgo * day),
        last_activity_at: new Date(Date.now() - opts.activity * day),
      },
    });
    await prisma.caseState.create({
      data: { case_id: c.id, state_code: 'NY', is_primary: true },
    });
    return c.id;
  }

  async function accept(caseId: string, attorneyId: string) {
    const bid = await prisma.bid.create({
      data: {
        case_id: caseId,
        attorney_id: attorneyId,
        fee_type: 'fixed',
        amount_cents: 100000,
        message: 'I can take this case and start today.',
        start_availability: 'immediately',
        turn: 'client',
        status: 'accepted',
        decided_at: new Date(),
      },
    });
    await prisma.case.update({
      where: { id: caseId },
      data: { accepted_bid_id: bid.id },
    });
  }

  const ids = (r: request.Response): string[] =>
    (r.body.data as { id?: string; caseId?: string }[]).map(
      (x) => x.id ?? x.caseId ?? '',
    );

  it('the client’s «Active»: most advanced first, newest activity inside a stage', async () => {
    const cli = await client();
    // Created newest → oldest: new1, bids, work, pending — the old order
    // (by date) would show the new one on top; the owner wants it last.
    const fresh = await mkCase(cli, 'New, no bids', 'open', {
      daysAgo: 1,
      activity: 1,
    });
    const bids = await mkCase(cli, 'Open with bids', 'open', {
      bids: 2,
      daysAgo: 2,
      activity: 2,
    });
    const workOld = await mkCase(cli, 'In work, quiet', 'in_progress', {
      daysAgo: 3,
      activity: 9,
    });
    const workNew = await mkCase(cli, 'In work, busy', 'in_progress', {
      daysAgo: 8,
      activity: 3,
    });
    const pending = await mkCase(cli, 'Wrapping up', 'pending_completion', {
      daysAgo: 10,
      activity: 10,
    });
    const done = await mkCase(cli, 'Closed', 'closed', {
      daysAgo: 20,
      activity: 20,
    });

    const active = await api()
      .get('/api/v1/users/me/cases?filter=active')
      .set(auth(cli, 'client'));
    expect(active.status).toBe(200);
    expect(ids(active)).toEqual([pending, workNew, workOld, bids, fresh]);

    // Page by page the order holds and nothing repeats or goes missing.
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 6; i++) {
      const r: request.Response = await api()
        .get(
          `/api/v1/users/me/cases?filter=active&limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        )
        .set(auth(cli, 'client'));
      expect(r.status).toBe(200);
      seen.push(...ids(r));
      cursor = (r.body.meta?.nextCursor as string | null) ?? null;
      if (!cursor) break;
    }
    expect(seen).toEqual([pending, workNew, workOld, bids, fresh]);

    // «Done» keeps its date order (newest created first).
    const completed = await api()
      .get('/api/v1/users/me/cases?filter=completed')
      .set(auth(cli, 'client'));
    expect(ids(completed)).toEqual([done]);

    // «По этапам»: only the picked stages, still in stage order.
    const picked = await api()
      .get('/api/v1/users/me/cases?filter=active&stages=0,2')
      .set(auth(cli, 'client'));
    expect(ids(picked)).toEqual([workNew, workOld, fresh]);

    // «Ждёт меня»: bids to choose from, a completion to confirm.
    const awaiting = await api()
      .get('/api/v1/users/me/cases?filter=active&awaiting=true')
      .set(auth(cli, 'client'));
    expect(ids(awaiting)).toEqual([pending, bids]);

    // «Дата»: newest / oldest by the case's date, any stage.
    const newest = await api()
      .get('/api/v1/users/me/cases?filter=active&sort=newest')
      .set(auth(cli, 'client'));
    expect(ids(newest)).toEqual([fresh, bids, workOld, workNew, pending]);
    const oldest = await api()
      .get('/api/v1/users/me/cases?filter=active&sort=oldest&limit=2')
      .set(auth(cli, 'client'));
    expect(ids(oldest)).toEqual([pending, workNew]);
    const oldest2 = await api()
      .get(
        `/api/v1/users/me/cases?filter=active&sort=oldest&limit=2&cursor=${encodeURIComponent(oldest.body.meta.nextCursor as string)}`,
      )
      .set(auth(cli, 'client'));
    expect(ids(oldest2)).toEqual([workOld, bids]);

    // A bad stage is a 400, not a 500.
    const bad = await api()
      .get('/api/v1/users/me/cases?filter=active&stages=7')
      .set(auth(cli, 'client'));
    expect(bad.status).toBe(400);
  });

  it('the attorney’s «Active» work: wrapping up first, then in progress by activity', async () => {
    const cli = await client();
    const att = await attorney();
    const quiet = await mkCase(cli, 'Work, quiet', 'in_progress', {
      daysAgo: 2,
      activity: 7,
    });
    const busy = await mkCase(cli, 'Work, busy', 'in_progress', {
      daysAgo: 6,
      activity: 1,
    });
    const dispute = await mkCase(cli, 'Disputed', 'disputed', {
      daysAgo: 9,
      activity: 9,
    });
    for (const id of [quiet, busy, dispute]) await accept(id, att);

    const r = await api()
      .get('/api/v1/users/me/work?filter=active')
      .set(auth(att, 'attorney'));
    expect(r.status).toBe(200);
    expect(ids(r)).toEqual([dispute, busy, quiet]);
    expect(
      (r.body.data as { lastActivityAt: string }[]).map(
        (x) => typeof x.lastActivityAt,
      ),
    ).toEqual(['string', 'string', 'string']);

    const paged = await api()
      .get('/api/v1/users/me/work?filter=active&limit=1')
      .set(auth(att, 'attorney'));
    expect(ids(paged)).toEqual([dispute]);
    const next = await api()
      .get(
        `/api/v1/users/me/work?filter=active&limit=1&cursor=${encodeURIComponent(paged.body.meta.nextCursor as string)}`,
      )
      .set(auth(att, 'attorney'));
    expect(ids(next)).toEqual([busy]);

    const inWork = await api()
      .get('/api/v1/users/me/work?filter=active&stages=2')
      .set(auth(att, 'attorney'));
    expect(ids(inWork)).toEqual([busy, quiet]);
  });
});
