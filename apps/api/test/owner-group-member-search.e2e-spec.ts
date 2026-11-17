import type { AddressInfo, Server } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * Row 110 (Telegram «Search members», WhatsApp 🔍 over participants):
 * GET /groups/:id/members?q= — only the members whose name (any alphabet)
 * or @username matches; strangers see nothing.
 */
jest.setTimeout(120_000);

describe('Group member search (e2e, row 110)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let base = '';

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
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(base);
  const bearer = (id: string) => ({
    Authorization: `Bearer ${tokens.signAccessToken({
      sub: id,
      role: 'client',
      sid: randomUUID(),
      verified: false,
      subscriptionStatus: 'none',
    })}`,
  });
  const person = (first: string, last: string) =>
    prisma.user.create({
      data: { role: 'client', first_name: first, last_name: last },
    });

  it('finds members by name in any alphabet and by @username', async () => {
    const tag = randomUUID().slice(0, 6);
    const [owner, emily, bob, cy] = await Promise.all([
      person('Olga', 'Owner'),
      person('Emily', `Zvorykina${tag}`),
      person('Bob', 'Stone'),
      person('Cy', 'Outsider'),
    ]);
    await prisma.state.upsert({
      where: { code: 'NJ' },
      create: { code: 'NJ', name: 'New Jersey', is_active: true },
      update: {},
    });
    await prisma.clientProfile.create({
      data: {
        user_id: bob.id,
        state_code: 'NJ',
        username: `bobby${tag}`,
        username_lower: `bobby${tag}`,
      },
    });
    const g = await api()
      .post('/api/v1/groups')
      .set(bearer(owner.id))
      .send({ title: 'Search', type: 'closed', memberIds: [emily.id, bob.id] })
      .expect(201);
    const id = g.body.data.id as string;
    // Invited people join (owner 2026-10-21: nobody is put in).
    for (const u of [emily, bob]) {
      const list = await api()
        .get('/api/v1/groups/invites')
        .set(bearer(u.id))
        .expect(200);
      const inv = (list.body.data as { id: string; groupId: string }[]).find(
        (i) => i.groupId === id,
      );
      await api()
        .post(`/api/v1/groups/invites/${inv!.id}/accept`)
        .set(bearer(u.id))
        .expect(200);
    }
    const find = async (q: string) =>
      (
        (
          await api()
            .get(`/api/v1/groups/${id}/members`)
            .query({ q })
            .set(bearer(owner.id))
            .expect(200)
        ).body as { data: { userId: string }[]; meta?: { nextCursor?: null } }
      ).data.map((m) => m.userId);

    expect(await find('Эмили')).toEqual([emily.id]);
    expect(await find(`zvorykina${tag}`)).toEqual([emily.id]);
    expect(await find(`@bobby${tag}`)).toEqual([bob.id]);
    expect(await find('Outsider')).toEqual([]);
    // Without q: everybody, the normal page.
    expect((await find('')).sort()).toEqual(
      [owner.id, emily.id, bob.id].sort(),
    );
    await api()
      .get(`/api/v1/groups/${id}/members`)
      .query({ q: 'Emily' })
      .set(bearer(cy.id))
      .expect(404);
  });
});
