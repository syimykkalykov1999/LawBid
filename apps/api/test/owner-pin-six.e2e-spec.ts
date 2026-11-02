import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { ensurePostPractices } from './support/post-practices';

/** Owner 2026-10-28: up to six pinned posts per profile list (was three);
 * the profile shows them first, in slot order 1..6. */
jest.setTimeout(120_000);

describe('Six pinned posts (e2e)', () => {
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
    base = `http://127.0.0.1:${((app.getHttpServer() as Server).address() as AddressInfo).port}`;
    prisma = app.get(PrismaService);
    tokens = app.get(TokenService);
    await ensurePostPractices(prisma);
  });

  afterAll(async () => {
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

  it('pins into 1..6, refuses 7, lists them first in slot order', async () => {
    const u = await prisma.user.create({
      data: { role: 'attorney', first_name: 'Pin', last_name: 'Six' },
    });
    const username = `ps${u.id.slice(0, 8)}`;
    await prisma.attorneyProfile.create({
      data: {
        user_id: u.id,
        username,
        username_lower: username,
        languages: ['en'],
        verification_status: 'verified',
      },
    });
    const author = auth(u.id, 'attorney');
    const ids: string[] = [];
    for (let i = 0; i < 7; i++) {
      const made = await api()
        .post('/api/v1/posts')
        .set(author)
        .set('Idempotency-Key', randomUUID())
        .send({ title: `T${i}`, practiceCode: 'family_law', body: `Pin ${i}` });
      expect(made.status).toBe(201);
      ids.push(made.body.data.id as string);
    }
    // Pinned in reverse so the list order comes from the slot, not the date.
    for (let slot = 6; slot >= 1; slot--) {
      const pinned = await api()
        .post(`/api/v1/posts/${ids[slot - 1]}/pin`)
        .set(author)
        .send({ slot });
      expect(pinned.status).toBe(201);
      expect(pinned.body.data.pinSlot).toBe(slot);
    }
    const seven = await api()
      .post(`/api/v1/posts/${ids[6]}/pin`)
      .set(author)
      .send({ slot: 7 });
    expect(seven.status).toBe(400);

    const viewer = await prisma.user.create({ data: { role: 'client' } });
    const list = await api()
      .get(`/api/v1/attorneys/${u.id}/posts`)
      .set(auth(viewer.id, 'client'));
    expect(list.status).toBe(200);
    const items = list.body.data as { id: string; pinSlot: number | null }[];
    expect(items.slice(0, 6).map((p) => p.pinSlot)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(items.slice(0, 6).map((p) => p.id)).toEqual(ids.slice(0, 6));

    // The database check is 1..6 too (checked where the row lives: with
    // E2E_TWO_DB the default client may not hold this shard).
    const here = await prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::INT AS n FROM posts WHERE id = ${ids[6]}::UUID`;
    if (here[0]?.n === 1) {
      await expect(
        prisma.$executeRaw`UPDATE posts SET pin_slot = 7, pin_group = 'grid'
                           WHERE id = ${ids[6]}::UUID`,
      ).rejects.toThrow();
    }
  });
});
