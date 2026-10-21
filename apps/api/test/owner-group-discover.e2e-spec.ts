import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * Owner 2026-10-20: «algorithms for groups so the ones I care about show
 * up» — GET /groups/discover ranks public groups for the viewer from a
 * cached snapshot: shared people first, never my own / removed / blocked /
 * private groups, paged by a cursor.
 */
jest.setTimeout(120_000);

describe('Recommended groups (e2e)', () => {
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
      data: { role: 'client', first_name: first, last_name: 'Disc' },
    });
  const mk = async (
    owner: string,
    title: string,
    type: 'public' | 'private',
    memberIds: string[] = [],
  ) => {
    const tag = randomUUID().slice(0, 8);
    const res = await api()
      .post('/api/v1/groups')
      .set(bearer(owner))
      .send({
        title,
        type,
        memberIds,
        ...(type === 'public' ? { username: `disc_${tag}` } : {}),
      })
      .expect(201);
    return res.body.data.id as string;
  };
  const discover = async (viewer: string, query = '') => {
    const res = await api()
      .get(`/api/v1/groups/discover${query}`)
      .set(bearer(viewer))
      .expect(200);
    return {
      items: res.body.data as { id: string; mutualCount?: number }[],
      nextCursor: (res.body.meta?.nextCursor ?? null) as string | null,
    };
  };

  it('offers public groups of people I share, never mine / private / blocked', async () => {
    const [me, friend, stranger, blocked] = await Promise.all([
      person('Me'),
      person('Friend'),
      person('Stranger'),
      person('Blocked'),
    ]);
    const shared = await mk(friend.id, 'Shared friends', 'public', [me.id]);
    const own = await mk(me.id, 'Mine', 'public');
    const other = await mk(stranger.id, 'Strangers', 'public');
    const hidden = await mk(stranger.id, 'Secret', 'private', [blocked.id]);
    const bad = await mk(blocked.id, 'From blocked', 'public');
    // the group I share with `friend` is private, so the friend's public one
    // is the shared-people signal
    const friendPublic = await mk(friend.id, 'Friend public', 'public');
    await prisma.userBlock.create({
      data: { blocker_id: me.id, blocked_id: blocked.id },
    });
    const { items } = await discover(me.id);
    const ids = items.map((i) => i.id);
    expect(ids).toContain(other);
    expect(ids).toContain(friendPublic);
    expect(ids).not.toContain(own);
    expect(ids).not.toContain(hidden);
    expect(ids).not.toContain(bad);
    expect(ids).not.toContain(shared); // I am already in it
    const f = items.find((i) => i.id === friendPublic);
    expect(f?.mutualCount ?? 0).toBeGreaterThan(0);
    // shared people beat a stranger's group
    expect(ids.indexOf(friendPublic)).toBeLessThan(ids.indexOf(other));
  });

  it('drops a group once I join it, and pages with a cursor', async () => {
    const [me, owner] = await Promise.all([person('Me2'), person('Own2')]);
    const made = [] as string[];
    for (let i = 0; i < 4; i += 1) {
      made.push(await mk(owner.id, `Page ${i}`, 'public'));
    }
    const first = await discover(me.id, '?limit=2');
    expect(first.items.length).toBeLessThanOrEqual(2);
    expect(first.nextCursor).not.toBeNull();
    const second = await discover(me.id, `?limit=2&cursor=${first.nextCursor}`);
    const firstIds = new Set(first.items.map((i) => i.id));
    expect(second.items.every((i) => !firstIds.has(i.id))).toBe(true);
    const target = first.items[0].id;
    await prisma.chatGroupMember.create({
      data: { group_id: target, user_id: me.id, role: 'member' },
    });
    const again = await discover(me.id, '?limit=30');
    expect(again.items.map((i) => i.id)).not.toContain(target);
    await api()
      .get('/api/v1/groups/discover?cursor=not-a-cursor')
      .set(bearer(me.id))
      .expect(400);
    expect(made.length).toBe(4);
  });

  it('cold start: a user with no ties still gets popular public groups', async () => {
    const [newbie, owner] = await Promise.all([person('New'), person('Own3')]);
    const id = await mk(owner.id, 'Popular', 'public');
    const { items } = await discover(newbie.id, '?limit=30');
    expect(items.map((i) => i.id)).toContain(id);
  });

  it('never ends at the ranked pool: popular, then newest, no repeats', async () => {
    const [me, owner] = await Promise.all([person('Me4'), person('Own4')]);
    // Many public groups: more than the ranked pool (100) of one snapshot.
    const total = 130;
    const rows = Array.from({ length: total }, (_, i) => ({
      id: randomUUID(),
      title: `Bulk ${i}`,
      i,
    }));
    for (const r of rows) {
      await prisma.chatGroup.create({
        data: {
          id: r.id,
          title: r.title,
          group_type: 'public',
          username: `bulk_${r.id.replaceAll('-', '').slice(0, 12)}`,
          username_lower: `bulk_${r.id.replaceAll('-', '').slice(0, 12)}`,
          invite_code: r.id.slice(0, 16),
          created_by: owner.id,
          member_count: 1 + r.i,
        },
      });
      await prisma.chatGroupMember.create({
        data: { group_id: r.id, user_id: owner.id, role: 'owner' },
      });
    }
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 40; page += 1) {
      const res = await discover(
        me.id,
        `?limit=30${cursor ? `&cursor=${cursor}` : ''}`,
      );
      seen.push(...res.items.map((i) => i.id));
      cursor = res.nextCursor;
      if (!cursor) break;
    }
    expect(new Set(seen).size).toBe(seen.length);
    const mine = new Set<string>(rows.map((r) => r.id));
    expect(seen.filter((id) => mine.has(id)).length).toBeGreaterThan(110);
  });
});
