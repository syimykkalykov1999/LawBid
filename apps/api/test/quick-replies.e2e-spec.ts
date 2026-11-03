import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { QUICK_REPLIES_MAX } from '../src/modules/quick-replies/quick-replies.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * Owner 2026-11-02: quick replies. Private to the owner, trimmed, capped at
 * 50, someone else's id looks missing, delete is idempotent.
 */
jest.setTimeout(120_000);

describe('Quick replies (e2e)', () => {
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
  const bearer = (id: string, role: 'client' | 'attorney') => ({
    Authorization: `Bearer ${tokens.signAccessToken({
      sub: id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    })}`,
  });

  async function lawyer(first: string) {
    const u = await prisma.user.create({
      data: { role: 'attorney', first_name: first, last_name: 'Quick' },
    });
    return { id: u.id, auth: bearer(u.id, 'attorney') };
  }

  it('creates, lists in order, edits and deletes', async () => {
    const a = await lawyer('Qa');
    const r1 = await api()
      .post('/api/v1/quick-replies')
      .set(a.auth)
      .send({ title: '  Hello ', body: '  Hi, how can I help?  ' })
      .expect(201);
    expect(r1.body.data).toMatchObject({
      title: 'Hello',
      body: 'Hi, how can I help?',
    });
    await api()
      .post('/api/v1/quick-replies')
      .set(a.auth)
      .send({ title: 'Fee', body: 'My fee is…' })
      .expect(201);
    const list = await api()
      .get('/api/v1/quick-replies')
      .set(a.auth)
      .expect(200);
    const items = list.body.data.items as { title: string }[];
    expect(items.map((i) => i.title)).toEqual(['Hello', 'Fee']);
    const id = r1.body.data.id as string;
    const upd = await api()
      .patch(`/api/v1/quick-replies/${id}`)
      .set(a.auth)
      .send({ title: 'Hi', body: 'Hello!' })
      .expect(200);
    expect(upd.body.data).toMatchObject({ id, title: 'Hi', body: 'Hello!' });
    await api().delete(`/api/v1/quick-replies/${id}`).set(a.auth).expect(204);
    await api().delete(`/api/v1/quick-replies/${id}`).set(a.auth).expect(204);
    const after = await api()
      .get('/api/v1/quick-replies')
      .set(a.auth)
      .expect(200);
    expect(after.body.data.items).toHaveLength(1);
  });

  it('keeps replies private: another person cannot see or change them', async () => {
    const a = await lawyer('Qb');
    const b = await lawyer('Qc');
    const r = await api()
      .post('/api/v1/quick-replies')
      .set(a.auth)
      .send({ title: 'Mine', body: 'secret' })
      .expect(201);
    const id = r.body.data.id as string;
    const theirs = await api()
      .get('/api/v1/quick-replies')
      .set(b.auth)
      .expect(200);
    expect(theirs.body.data.items).toHaveLength(0);
    await api()
      .patch(`/api/v1/quick-replies/${id}`)
      .set(b.auth)
      .send({ title: 'x', body: 'y' })
      .expect(404);
    await api().delete(`/api/v1/quick-replies/${id}`).set(b.auth).expect(204);
    const still = await api()
      .get('/api/v1/quick-replies')
      .set(a.auth)
      .expect(200);
    expect(still.body.data.items).toHaveLength(1);
  });

  it('is for attorneys only', async () => {
    const c = await prisma.user.create({
      data: { role: 'client', first_name: 'Cl', last_name: 'Quick' },
    });
    const auth = bearer(c.id, 'client');
    await api().get('/api/v1/quick-replies').set(auth).expect(403);
    await api()
      .post('/api/v1/quick-replies')
      .set(auth)
      .send({ title: 't', body: 'b' })
      .expect(403);
  });

  it('two parallel adds never pass the cap', async () => {
    const a = await lawyer('Qe');
    await prisma.quickReply.createMany({
      data: Array.from({ length: QUICK_REPLIES_MAX - 1 }, (_, i) => ({
        user_id: a.id,
        title: `t${i}`,
        body: 'b',
        position: i,
      })),
    });
    const post = () =>
      api()
        .post('/api/v1/quick-replies')
        .set(a.auth)
        .send({ title: 'x', body: 'y' });
    const codes = (await Promise.all([post(), post()])).map((r) => r.status);
    expect(codes.sort()).toEqual([201, 400]);
    expect(await prisma.quickReply.count({ where: { user_id: a.id } })).toBe(
      QUICK_REPLIES_MAX,
    );
  });

  it('rejects empty and over-long text and stops at the cap', async () => {
    const a = await lawyer('Qd');
    await api()
      .post('/api/v1/quick-replies')
      .set(a.auth)
      .send({ title: '   ', body: 'x' })
      .expect(400);
    await api()
      .post('/api/v1/quick-replies')
      .set(a.auth)
      .send({ title: 't', body: 'x'.repeat(1001) })
      .expect(400);
    await prisma.quickReply.createMany({
      data: Array.from({ length: QUICK_REPLIES_MAX }, (_, i) => ({
        user_id: a.id,
        title: `t${i}`,
        body: 'b',
        position: i,
      })),
    });
    await api()
      .post('/api/v1/quick-replies')
      .set(a.auth)
      .send({ title: 'one more', body: 'b' })
      .expect(400);
  });
});
