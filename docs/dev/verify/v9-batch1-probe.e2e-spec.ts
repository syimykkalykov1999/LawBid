/**
 * Проверка 17.11, пачка 1 (комментарии, лайки и звёзды, посты и лента).
 * Живые HTTP-запросы к API (поднимается внутри набора), настоящие Postgres
 * и Redis Мака. Запуск: docs/dev/verify/v9-run.sh v9-batch1-probe
 * Каждая проверка печатает строку "V9 <номер> {...}" и падает, если итог не тот.
 */
import type { AddressInfo, Server } from 'node:net';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { CounterAggregator } from '../src/modules/counters/counter-aggregator.service';
import { ensurePostPractices } from './support/post-practices';

jest.setTimeout(300_000);
type Auth = Record<string, string>;
const log = (id: string, o: unknown) =>
  process.stdout.write(
    `V9 ${id} ${JSON.stringify(o, (_k, v) => (typeof v === 'bigint' ? Number(v) : v))}\n`,
  );

describe('verify batch 1 probe 17.11', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let base = '';
  const api = () => request(base);

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const m = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = m.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${((app.getHttpServer() as Server).address() as AddressInfo).port}`;
    prisma = app.get(PrismaService);
    tokens = app.get(TokenService);
    await ensurePostPractices(prisma);
    // The e2e base runs only prisma/migrations; the deploy also runs
    // prisma/concurrent (run-concurrent.mjs) — build this batch's indexes.
    const sql = readFileSync(
      join(__dirname, '../prisma/concurrent/20261217120000_verify_batch1_indexes.sql'),
      'utf8',
    )
      .replace(/--.*$/gm, '')
      .split(';')
      .map((x) => x.trim())
      .filter(Boolean);
    // V9_BEFORE=1: the run on the old code (no new indexes, dropped if left).
    if (process.env.V9_BEFORE) {
      for (const n of ['post_likes_post_created_user_idx', 'post_reposts_post_created_id_idx',
        'post_media_file_id_one_post_key', 'star_ledger_created_id_idx'])
        await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS ${n}`);
    } else {
      for (const q of sql) await prisma.$executeRawUnsafe(q);
    }
  });
  afterAll(async () => {
    await prisma.featureFlag.deleteMany({ where: { key: 'stars' } });
    await app.close();
  });

  async function user(role: 'client' | 'attorney', name = 'U') {
    const u = await prisma.user.create({ data: { role, first_name: name, last_name: 'Probe' } });
    if (role === 'attorney') {
      const username = `v9${u.id.slice(0, 8)}`;
      await prisma.attorneyProfile.create({
        data: {
          user_id: u.id,
          username,
          username_lower: username,
          languages: ['en'],
          verification_status: 'verified',
        },
      });
    }
    const t = tokens.signAccessToken({
      sub: u.id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    });
    return { id: u.id, auth: { Authorization: `Bearer ${t}` } as Auth };
  }

  async function newPost(a: Auth) {
    const r = await api()
      .post('/api/v1/posts')
      .set(a)
      .set('Idempotency-Key', randomUUID())
      .send({ title: 'Probe', practiceCode: 'family_law', body: 'Probe post' });
    expect(r.status).toBe(201);
    return r.body.data.id as string;
  }

  it('B1 a comment re-sent with the same Idempotency-Key is stored once', async () => {
    const att = await user('attorney');
    const fan = await user('client');
    const postId = await newPost(att.auth);
    const key = randomUUID();
    // The app's RetryInterceptor re-sends the same POST and key after a timeout.
    const send = () =>
      api()
        .post(`/api/v1/posts/${postId}/comments`)
        .set(fan.auth)
        .set('Idempotency-Key', key)
        .send({ body: 'Hello there' });
    const first = await send();
    const second = await send();
    const rows = await prisma.comment.count({ where: { post_id: postId } });
    const notes = await prisma.notification.count({
      where: { user_id: att.id, type: 'post_comment' },
    });
    log('B1', {
      statuses: [first.status, second.status],
      sameId: first.body.data?.id === second.body.data?.id,
      rows,
      notes,
    });
    expect(rows).toBe(1);
    expect(notes).toBe(1);
  });

  it('B2 a profile gift re-sent with the same key charges once', async () => {
    await prisma.featureFlag.upsert({
      where: { key: 'stars' },
      create: { key: 'stars', enabled: true },
      update: { enabled: true },
    });
    const a = await user('client', 'Giver');
    const b = await user('attorney', 'Taker');
    const f = await prisma.file.create({
      data: {
        owner_user_id: a.id,
        purpose: 'sticker',
        s3_bucket: 'media',
        s3_key: `e2e/${randomUUID()}.webp`,
        mime: 'image/webp',
        size_bytes: 1000n,
        sha256: randomUUID().replace(/-/g, '').padEnd(64, '0'),
        scan_status: 'clean',
        is_public: true,
      },
    });
    const g = await prisma.gift.create({ data: { title: 'Rose', price_stars: 10, file_id: f.id } });
    await prisma.starWallet.create({ data: { user_id: a.id, balance: 50, lifetime_bought: 50 } });
    const key = randomUUID();
    const send = () =>
      api()
        .post(`/api/v1/stars/gifts/${g.id}/send`)
        .set(a.auth)
        .set('Idempotency-Key', key)
        .send({ recipientId: b.id });
    const s1 = await send();
    const s2 = await send();
    const sends = await prisma.giftSend.count({ where: { sender_id: a.id } });
    const wallet = await prisma.starWallet.findUnique({ where: { user_id: a.id } });
    const ledger = await prisma.starLedger.count({ where: { user_id: a.id } });
    log('B2', { statuses: [s1.status, s2.status], sends, balance: wallet?.balance, ledger });
    expect(sends).toBe(1);
    expect(wallet?.balance).toBe(40);
  });

  it('B3 likers list pages through likes of the same millisecond without a gap', async () => {
    const att = await user('attorney');
    const postId = await newPost(att.auth);
    const fans = await Promise.all(Array.from({ length: 45 }, () => user('attorney')));
    // 45 likes at once: many share a millisecond.
    await Promise.all(fans.map((f) => api().post(`/api/v1/posts/${postId}/like`).set(f.auth)));
    const precise = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM post_likes
      WHERE post_id = ${postId}::uuid
        AND created_at <> date_trunc('milliseconds', created_at)`;
    const seen = new Set<string>();
    let cursor: string | undefined;
    let pages = 0;
    do {
      const r = await api()
        .get(`/api/v1/posts/${postId}/likes`)
        .query(cursor ? { cursor } : {})
        .set(att.auth)
        .expect(200);
      for (const p of r.body.data as {
        attorney: { id: string } | null;
        client: { id: string } | null;
      }[])
        seen.add(p.attorney?.id ?? p.client?.id ?? '?');
      cursor = r.body.meta?.nextCursor ?? undefined;
      pages += 1;
    } while (cursor && pages < 20);
    // A tiny test table is sorted in memory anyway; with sorting priced out
    // the plan shows whether an index can serve the order.
    const [, plan] = await prisma.$transaction([
      prisma.$executeRawUnsafe('SET LOCAL enable_sort = off'),
      prisma.$queryRawUnsafe<{ 'QUERY PLAN': string }[]>(
        `EXPLAIN SELECT post_id, user_id, created_at FROM post_likes WHERE post_id = '${postId}'
         ORDER BY created_at DESC, user_id DESC LIMIT 21`,
      ),
    ]);
    log('B3', {
      likes: fans.length,
      microsecondRows: Number(precise[0].n),
      listed: seen.size,
      pages,
      plan: plan.map((p) => p['QUERY PLAN'].trim()).join(' | ').slice(0, 200),
    });
    expect(seen.size).toBe(fans.length);
  });

  it('B4 the same photo cannot be in two posts created at once', async () => {
    const att = await user('attorney');
    const f = await prisma.file.create({
      data: {
        owner_user_id: att.id,
        purpose: 'post_image',
        s3_bucket: 'media',
        s3_key: `e2e/${randomUUID()}.webp`,
        mime: 'image/webp',
        size_bytes: 1000n,
        width: 100,
        height: 100,
        sha256: randomUUID().replace(/-/g, '').padEnd(64, '0'),
        scan_status: 'clean',
        is_public: true,
      },
    });
    const create = () =>
      api()
        .post('/api/v1/posts')
        .set(att.auth)
        .set('Idempotency-Key', randomUUID())
        .send({ title: 'Twin', practiceCode: 'family_law', body: 'x', mediaFileIds: [f.id] });
    const rs = await Promise.all(Array.from({ length: 6 }, create));
    const rows = await prisma.postMedia.count({ where: { file_id: f.id } });
    log('B4', { statuses: rs.map((r) => r.status), postMediaRows: rows });
    expect(rows).toBe(1);
  });

  it('B5 counters follow comment delete on the other side', async () => {
    const att = await user('attorney');
    const fan = await user('client');
    const other = await user('client');
    const postId = await newPost(att.auth);
    const c = await api()
      .post(`/api/v1/posts/${postId}/comments`)
      .set(fan.auth)
      .send({ body: 'one' })
      .expect(201);
    await app.get(CounterAggregator).flush();
    const before = (await api().get(`/api/v1/posts/${postId}`).set(other.auth)).body.data
      .commentCount;
    await api().delete(`/api/v1/comments/${c.body.data.id}`).set(att.auth).expect(200);
    await app.get(CounterAggregator).flush();
    const after = (await api().get(`/api/v1/posts/${postId}`).set(other.auth)).body.data
      .commentCount;
    const list = (await api().get(`/api/v1/posts/${postId}/comments`).set(other.auth)).body.data;
    log('B5', { before, after, listForOther: list.length });
    expect([before, after, list.length]).toEqual([1, 0, 0]);
  });
});
