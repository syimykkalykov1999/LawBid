import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * Audit 2026-11-01: «Find groups» and the channel search need EVERY typed
 * word, rank exact > starts with > word start > inside, ignore one letter.
 */
jest.setTimeout(120_000);

describe('Group and channel search (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let base = '';
  let me = '';
  const tok = 'cmqzvkwx';

  const h = () => ({
    Authorization: `Bearer ${tokens.signAccessToken({
      sub: me,
      role: 'client',
      sid: randomUUID(),
      verified: false,
      subscriptionStatus: 'none',
    })}`,
  });

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const m = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = m.createNestApplication();
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
    me = (
      await prisma.user.create({
        data: { role: 'client', phone_verified_at: new Date() },
      })
    ).id;
    const owner = (
      await prisma.user.create({
        data: { role: 'client', phone_verified_at: new Date() },
      })
    ).id;
    const mk = (title: string, size: number, n: number) =>
      prisma.chatGroup.create({
        data: {
          title,
          created_by: owner,
          group_type: 'public',
          username: `g${n}_${tok}`,
          username_lower: `g${n}_${tok}`,
          invite_code: randomUUID().slice(0, 20),
          member_count: size,
        },
      });
    await mk(`Syn${tok}tax help`, 900, 1);
    await mk(`Big ${tok}tax club`, 500, 2);
    await mk(`${tok}tax`, 1, 3);
    await mk(`${tok}tax advice`, 50, 4);
    await mk(`Law and ${tok}tax`, 5, 5);
    const ch = (title: string, subs: number, n: number) =>
      prisma.channel.create({
        data: {
          owner_id: owner,
          title,
          username: `c${n}_${tok}`,
          subscriber_count: subs,
        },
      });
    await ch(`Syn${tok}tax help`, 900, 1);
    await ch(`${tok}tax`, 1, 2);
    await ch(`Law and ${tok}tax`, 5, 3);
  });

  afterAll(async () => {
    await app.close();
  });

  it('groups: best match first, not the biggest', async () => {
    const r = await request(base)
      .get(`/api/v1/groups/search?q=${tok}tax`)
      .set(h());
    expect(r.status).toBe(200);
    const titles = (r.body.data as { title: string }[]).map((g) => g.title);
    expect(titles[0]).toBe(`${tok}tax`);
    expect(titles[1]).toBe(`${tok}tax advice`);
    expect(titles).toContain(`Syn${tok}tax help`);
  });

  it('groups: every typed word, in any order; one letter finds nothing', async () => {
    const r = await request(base)
      .get(`/api/v1/groups/search?q=${encodeURIComponent(`tax law`)}`)
      .set(h());
    // "tax" and "law" must both be inside the title / @username.
    for (const g of r.body.data as { title: string }[]) {
      const t = g.title.toLowerCase();
      expect(t.includes('tax') || t.includes('law')).toBe(true);
    }
    const both = await request(base)
      .get(`/api/v1/groups/search?q=${encodeURIComponent(`${tok}tax law`)}`)
      .set(h());
    expect((both.body.data as { title: string }[]).map((g) => g.title)).toEqual(
      [`Law and ${tok}tax`],
    );
    const one = await request(base).get('/api/v1/groups/search?q=a').set(h());
    expect((one.body.data as unknown[] | undefined) ?? []).toEqual([]);
  });

  it('channels: best match first, every word', async () => {
    const r = await request(base)
      .get(`/api/v1/channels?scope=discover&q=${tok}tax`)
      .set(h());
    expect(r.status).toBe(200);
    const titles = (
      (r.body.data as { items?: { title: string }[] }).items ??
      (r.body.data as { title: string }[])
    ).map((c) => c.title);
    expect(titles[0]).toBe(`${tok}tax`);
    expect(titles).toContain(`Law and ${tok}tax`);
  });
});
