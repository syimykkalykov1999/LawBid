import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * Audit 17.11 (problem 6): «is the callee busy?» and the new call row were
 * not under one lock — two people calling the same person in the same
 * second (or two people calling each other) made two ringing calls. Now
 * exactly one call rings; the other caller hears «busy».
 */
jest.setTimeout(180_000);

describe('Two calls at the same second (e2e, audit 17.11)', () => {
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

  async function attorney() {
    const a = await prisma.user.create({
      data: { role: 'attorney', first_name: 'Bea', last_name: 'Busy' },
    });
    await prisma.attorneyProfile.create({
      data: {
        user_id: a.id,
        username: `race_${a.id.slice(0, 8)}`,
        username_lower: `race_${a.id.slice(0, 8)}`,
        languages: ['en'],
        verification_status: 'verified',
      },
    });
    await prisma.subscription.create({
      data: { user_id: a.id, status: 'active', price_cents: 39900 },
    });
    return a.id;
  }
  async function chatWith(attorneyId: string) {
    const c = await prisma.user.create({
      data: { role: 'client', first_name: 'Cy', last_name: 'Caller' },
    });
    const conv = await prisma.conversation.create({
      data: {
        client_id: c.id,
        attorney_id: attorneyId,
        status: 'active',
        contacts_unlocked: true,
        participants: {
          create: [{ user_id: c.id }, { user_id: attorneyId }],
        },
      },
    });
    return { clientId: c.id, convId: conv.id };
  }
  const call = (convId: string, who: string, role: 'client' | 'attorney') =>
    api()
      .post(`/api/v1/conversations/${convId}/calls`)
      .set(bearer(who, role))
      .send({});
  const ringingOf = (userId: string) =>
    prisma.call.count({
      where: {
        status: 'ringing',
        OR: [{ caller_id: userId }, { callee_id: userId }],
      },
    });

  it('two people call the same person at once: one rings, one is busy', async () => {
    for (let round = 0; round < 5; round += 1) {
      const b = await attorney();
      const [c, d] = await Promise.all([chatWith(b), chatWith(b)]);
      const [r1, r2] = await Promise.all([
        call(c.convId, c.clientId, 'client'),
        call(d.convId, d.clientId, 'client'),
      ]);
      expect([r1.status, r2.status]).toEqual([201, 201]);
      const statuses = [r1.body.data.status, r2.body.data.status].sort();
      expect(statuses).toEqual(['busy', 'ringing']);
      expect(await ringingOf(b)).toBe(1);
    }
  });

  it('two people call each other at once: one call rings', async () => {
    for (let round = 0; round < 5; round += 1) {
      const b = await attorney();
      const c = await chatWith(b);
      await Promise.all([
        call(c.convId, c.clientId, 'client'),
        call(c.convId, b, 'attorney'),
      ]);
      expect(await ringingOf(b)).toBe(1);
    }
  });
});
