import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/** Owner 2026-10-20 (Telegram): one @username namespace — rules, reserved,
 * taken, look-alikes, hold after a rename, suggestions, change cooldown.
 * Was: channels end to end — create / edit, @username, only
 * admins post, subscribe / mute, views counted once, one reaction, comments
 * (on / off, delete by an admin), notifications to subscribers, moderation
 * by report, and the admin team. */
jest.setTimeout(120_000);

describe('Usernames (e2e)', () => {
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
    await prisma.state.upsert({
      where: { code: 'NY' },
      create: { code: 'NY', name: 'New York' },
      update: {},
    });
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

  type Who = { id: string; username: string; auth: Record<string, string> };

  async function attorney(first: string): Promise<Who> {
    const u = await prisma.user.create({
      data: { role: 'attorney', first_name: first, last_name: 'Chan' },
    });
    const username = `ch${u.id.slice(0, 10)}`;
    await prisma.attorneyProfile.create({
      data: {
        user_id: u.id,
        username,
        username_lower: username,
        languages: ['en'],
        verification_status: 'verified',
      },
    });
    return { id: u.id, username, auth: auth(u.id, 'attorney') };
  }

  const rnd = () => randomUUID().replace(/-/g, '').slice(0, 10);
  const check = (who: Who, u: string, kind = 'channel') =>
    api()
      .get('/api/v1/usernames/check')
      .query({ u, kind })
      .set(who.auth)
      .then(
        (r) =>
          r.body.data as {
            available: boolean;
            reason: string | null;
            suggestions: string[];
            username: string;
          },
      );

  it('refuses bad shapes and reserved words', async () => {
    const a = await attorney('Ann');
    for (const bad of ['abc', 'a__bcde', 'abcde_', '1abcdef', 'ab cde']) {
      expect((await check(a, bad)).reason).toBe('invalid');
    }
    expect((await check(a, 'admin')).reason).toBe('reserved');
    expect((await check(a, 'Adm1n')).reason).toBe('reserved');
  });

  it('a taken handle is taken for people, channels and groups; look-alikes too', async () => {
    const a = await attorney('Ann');
    const base = `zq${rnd()}`;
    const res = await api()
      .post('/api/v1/channels')
      .set(a.auth)
      .send({ title: 'News', username: base });
    expect(res.status).toBe(201);
    const same = await check(a, base.toUpperCase(), 'group');
    expect(same.available).toBe(false);
    expect(same.reason).toBe('taken');
    expect(same.suggestions.length).toBeGreaterThanOrEqual(1);
    const twin = await check(
      a,
      base.replace('z', 'Z').replace(/o/g, '0') + '_',
    );
    expect(twin.available).toBe(false);
    // Every suggestion is itself free.
    for (const s of same.suggestions) {
      expect((await check(a, s)).available).toBe(true);
    }
    const dup = await api()
      .post('/api/v1/channels')
      .set((await attorney('Bob')).auth)
      .send({ title: 'Other', username: base.toUpperCase() });
    expect(dup.status).toBe(409);
  });

  it('a renamed handle is held for its old owner and the change is rate-limited', async () => {
    const a = await attorney('Ann');
    const b = await attorney('Bob');
    const first = `hq${rnd()}`;
    const ch = await api()
      .post('/api/v1/channels')
      .set(a.auth)
      .send({ title: 'News', username: first });
    expect(ch.status).toBe(201);
    const id = ch.body.data.id as string;
    await prisma.$executeRaw`UPDATE channels SET username_changed_at = now() - interval '400 days' WHERE id = ${id}::uuid`;
    const next = `hq${rnd()}`;
    const ren = await api()
      .patch(`/api/v1/channels/${id}`)
      .set(a.auth)
      .send({ username: next });
    expect(ren.status).toBe(200);
    expect((await check(b, first)).reason).toBe('held');
    expect((await check(a, first)).available).toBe(true);
    const again = await api()
      .patch(`/api/v1/channels/${id}`)
      .set(a.auth)
      .send({ username: `hq${rnd()}` });
    expect(again.status).toBe(409);
  });
});
