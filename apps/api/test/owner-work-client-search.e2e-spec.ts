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
 * Owner 2026-10-18: «В работе» search also looks at the CLIENT of the case
 * (name in any alphabet, @username) — and title / description ignoring
 * accents and ё. Without a subscription the client's name stays hidden, so
 * it is not searchable either.
 */
jest.setTimeout(60_000);

describe('Work list: search by client (e2e, owner 2026-10-18)', () => {
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
  const auth = (id: string, role: string) => ({
    Authorization: `Bearer ${tokens.signAccessToken({
      sub: id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    })}`,
  });

  async function client(first: string, last: string) {
    const u = await prisma.user.create({
      data: { role: 'client', first_name: first, last_name: last },
    });
    const handle = `cl_${u.id.slice(0, 8)}`;
    await prisma.clientProfile.create({
      data: {
        user_id: u.id,
        state_code: 'NY',
        username: handle,
        username_lower: handle,
      },
    });
    return { id: u.id, handle };
  }

  async function attorney(subscribed: boolean) {
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
    if (subscribed) {
      await prisma.subscription.create({
        data: { user_id: u.id, status: 'active', price_cents: 39900 },
      });
    }
    return u.id;
  }

  async function work(
    attorneyId: string,
    clientId: string,
    title: string,
    description: string,
  ) {
    const area = await prisma.practiceArea.findUniqueOrThrow({
      where: { code: 'family_law' },
    });
    const c = await prisma.case.create({
      data: {
        client_id: clientId,
        title,
        description,
        practice_area_id: area.id,
        primary_state_code: 'NY',
        budget_mode: 'clarify_later',
      },
    });
    const bid = await prisma.bid.create({
      data: {
        case_id: c.id,
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
      where: { id: c.id },
      data: { accepted_bid_id: bid.id, status: 'in_progress' },
    });
    return c.id;
  }

  const ids = (r: request.Response) =>
    (r.body.data as { caseId: string }[]).map((x) => x.caseId).sort();

  it('finds the attorney work by client name (any alphabet), @username and accent-free text', async () => {
    const att = await attorney(true);
    const emily = await client('Emily', 'Zvorykina');
    const bob = await client('Bob', 'Stone');
    const k1 = await work(
      att,
      emily.id,
      'Custody review',
      'Parenting plan, école nearby',
    );
    const k2 = await work(att, bob.id, 'Garage dispute', 'Neighbour fence');
    const list = (q: string, a = att) =>
      api()
        .get('/api/v1/users/me/work')
        .query({ filter: 'active', q })
        .set(auth(a, 'attorney'));

    expect(ids(await list(''))).toEqual([k1, k2].sort());
    // Cyrillic client name → Latin name; either word order.
    expect(ids(await list('Эмили'))).toEqual([k1]);
    expect(ids(await list('zvorykina emily'))).toEqual([k1]);
    // @username of the client.
    expect(ids(await list(`@${bob.handle}`))).toEqual([k2]);
    // A name word AND a title word (each word may match a different field).
    expect(ids(await list('Эмили custody'))).toEqual([k1]);
    expect(ids(await list('Bob custody'))).toEqual([]);
    // Accents / ё-insensitive text: "ecole" finds "école".
    expect(ids(await list('ecole'))).toEqual([k1]);
    expect(ids(await list('nobody'))).toEqual([]);

    // Without a subscription the client's name is hidden — and unsearchable.
    const free = await attorney(false);
    const k3 = await work(free, emily.id, 'Another matter', 'Some details');
    expect(ids(await list('', free))).toEqual([k3]);
    expect(ids(await list('Emily', free))).toEqual([]);
    expect(ids(await list('matter', free))).toEqual([k3]);
  });
});
