import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * Sweep B-c1 (2026-11-09): a group card no longer carries every member and
 * a poll's voters no longer come all at once — GET /groups/:id holds up to
 * 100 members + membersNextCursor, GET /groups/:id/members pages the rest
 * (owner, admins, then join time), and one option's voters page through
 * GET /groups/:id/polls/:pollId/options/:optionId/voters.
 */
jest.setTimeout(180_000);

describe('Group members and poll voters, page by page (e2e)', () => {
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
  const person = (first: string) =>
    prisma.user.create({
      data: { role: 'client', first_name: first, last_name: 'Pages' },
    });

  /** A group of [extra] + 1 members (owner + one admin + plain members),
   * the members put in directly (invites are another suite). */
  async function bigGroup(extra: number) {
    const owner = await person('Owner');
    const res = await api()
      .post('/api/v1/groups')
      .set(bearer(owner.id))
      .send({ title: 'Big', type: 'closed', memberIds: [] })
      .expect(201);
    const id = res.body.data.id as string;
    const people = await prisma.user.createManyAndReturn({
      data: Array.from({ length: extra }, (_, i) => ({
        role: 'client' as const,
        first_name: `M${String(i).padStart(3, '0')}`,
        last_name: 'Pages',
      })),
      select: { id: true },
    });
    const t0 = Date.now();
    await prisma.chatGroupMember.createMany({
      data: people.map((p, i) => ({
        group_id: id,
        user_id: p.id,
        role: i === extra - 1 ? ('admin' as const) : ('member' as const),
        joined_at: new Date(t0 + i * 1000),
      })),
    });
    return { owner, id, people: people.map((p) => p.id) };
  }

  it('a small group: the card holds everyone and no cursor', async () => {
    const { owner, id } = await bigGroup(3);
    const d = await api()
      .get(`/api/v1/groups/${id}`)
      .set(bearer(owner.id))
      .expect(200);
    expect(d.body.data.members).toHaveLength(4);
    expect(d.body.data.membersNextCursor).toBeNull();
  });

  it('a big group: the card holds 100, the pages hold the rest once each, owner and admin first', async () => {
    const { owner, id, people } = await bigGroup(160);
    const d = await api()
      .get(`/api/v1/groups/${id}`)
      .set(bearer(owner.id))
      .expect(200);
    const first = d.body.data.members as { userId: string; role: string }[];
    expect(first).toHaveLength(100);
    expect(first[0]).toMatchObject({ userId: owner.id, role: 'owner' });
    expect(first[1]).toMatchObject({ userId: people[159], role: 'admin' });
    expect(typeof d.body.data.membersNextCursor).toBe('string');

    const seen = new Set(first.map((m) => m.userId));
    let cursor = d.body.data.membersNextCursor as string | null;
    let pages = 0;
    while (cursor) {
      const p = await api()
        .get(`/api/v1/groups/${id}/members`)
        .query({ cursor, limit: 25 })
        .set(bearer(owner.id))
        .expect(200);
      for (const m of p.body.data as { userId: string }[]) {
        expect(seen.has(m.userId)).toBe(false);
        seen.add(m.userId);
      }
      cursor = p.body.meta?.nextCursor ?? null;
      pages++;
    }
    expect(seen.size).toBe(161);
    expect(pages).toBe(3); // 61 left: 25 + 25 + 11

    // From the start, the same order as the card.
    const p1 = await api()
      .get(`/api/v1/groups/${id}/members`)
      .query({ limit: 100 })
      .set(bearer(owner.id))
      .expect(200);
    expect((p1.body.data as { userId: string }[]).map((m) => m.userId)).toEqual(
      first.map((m) => m.userId),
    );
  });

  it('members: a stranger gets 404/403, a bad cursor 400', async () => {
    const { owner, id } = await bigGroup(2);
    const stranger = await person('Stranger');
    const res = await api()
      .get(`/api/v1/groups/${id}/members`)
      .set(bearer(stranger.id));
    expect([403, 404]).toContain(res.status);
    await api()
      .get(`/api/v1/groups/${id}/members`)
      .query({ cursor: 'not-a-cursor' })
      .set(bearer(owner.id))
      .expect(400);
  });

  it('poll voters: the old list stops at 50 per option, the option pages hold everyone', async () => {
    const { owner, id, people } = await bigGroup(70);
    const made = await api()
      .post(`/api/v1/groups/${id}/polls`)
      .set(bearer(owner.id))
      .send({
        clientMessageId: randomUUID(),
        question: 'Lunch?',
        options: ['Pizza', 'Soup'],
        multiple: false,
        anonymous: false,
      })
      .expect(201);
    const poll = made.body.data.poll as {
      id: string;
      options: { id: string }[];
    };
    const [pizza] = poll.options;
    const t0 = Date.now();
    await prisma.chatGroupPollVote.createMany({
      data: people.map((u, i) => ({
        poll_id: poll.id,
        option_id: pizza.id,
        user_id: u,
        created_at: new Date(t0 + i * 1000),
      })),
    });
    const old = await api()
      .get(`/api/v1/groups/${id}/polls/${poll.id}/voters`)
      .set(bearer(owner.id))
      .expect(200);
    const pizzaOld = (
      old.body.data as { optionId: string; voters: unknown[] }[]
    ).find((o) => o.optionId === pizza.id);
    expect(pizzaOld?.voters).toHaveLength(50);

    const all: string[] = [];
    let cursor: string | null = null;
    do {
      const q: Record<string, string | number> = { limit: 30 };
      if (cursor) q.cursor = cursor;
      const p = await api()
        .get(`/api/v1/groups/${id}/polls/${poll.id}/options/${pizza.id}/voters`)
        .query(q)
        .set(bearer(owner.id))
        .expect(200);
      all.push(...(p.body.data as { userId: string }[]).map((v) => v.userId));
      cursor = p.body.meta?.nextCursor ?? null;
    } while (cursor);
    expect(all).toEqual(people); // oldest vote first, no gaps, no repeats

    await api()
      .get(
        `/api/v1/groups/${id}/polls/${poll.id}/options/${randomUUID()}/voters`,
      )
      .set(bearer(owner.id))
      .expect(404);
  });
});
