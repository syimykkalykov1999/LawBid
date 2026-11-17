/**
 * Проверка 17.11 (верификатор контента и медиа). Живые HTTP-запросы к API,
 * настоящие Postgres, Redis/Valkey (db 13) и MinIO. Код продукта не меняется.
 * Запуск: docs/dev/verify/run-suites.sh probe content-probe
 * Каждая проверка печатает строку "CMV <номер> {...}" с замером и падает,
 * если результат не тот. Настройки, которые меняются, возвращаются в конце
 * каждой проверки (было → тест → вернул) и печатаются тоже.
 */
import type { AddressInfo, Server } from 'node:net';
import { createHash, randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import sharp from 'sharp';
import type Redis from 'ioredis';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { CounterAggregator } from '../src/modules/counters/counter-aggregator.service';
import { S3StorageService } from '../src/modules/files/storage/s3-storage.service';
import { StorageCleanupService } from '../src/modules/storage/storage-cleanup.service';
import { avifKey, variantKey } from '../src/modules/files/files.policy';
import { dropAppConfigCache } from '../src/modules/feature-flags/services/app-config.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { ensurePostPractices } from './support/post-practices';

jest.setTimeout(300_000);
type Auth = Record<string, string>;
const log = (id: string, o: unknown) =>
  process.stdout.write(
    `CMV ${id} ${JSON.stringify(o, (_k, v) => (typeof v === 'bigint' ? Number(v) : v))}\n`,
  );
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

describe('content + media probe 17.11', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let storage: S3StorageService;
  let redis: Redis;
  let base = '';
  const api = () => request(base);
  const flush = () => app.get(CounterAggregator).flush();

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
    storage = app.get(S3StorageService);
    redis = app.get<Redis>(REDIS_CLIENT);
    await ensurePostPractices(prisma);
  });
  afterAll(async () => {
    await app.close();
  });

  async function user(role: 'client' | 'attorney', name = 'U') {
    const u = await prisma.user.create({ data: { role, first_name: name, last_name: 'Test' } });
    let username: string | null = null;
    if (role === 'attorney') {
      username = `cmv${u.id.slice(0, 8)}`;
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
    return { id: u.id, username, auth: { Authorization: `Bearer ${t}` } as Auth };
  }

  async function newPost(a: Auth, extra: Record<string, unknown> = {}) {
    const r = await api()
      .post('/api/v1/posts')
      .set(a)
      .set('Idempotency-Key', randomUUID())
      .send({ title: 'Probe', practiceCode: 'family_law', body: 'Probe post', ...extra });
    expect(r.status).toBe(201);
    return r.body.data.id as string;
  }

  async function setConfig(key: string, value: unknown) {
    const before = await prisma.appConfig.findUnique({ where: { key } });
    await prisma.appConfig.upsert({
      where: { key },
      create: { key, value: value as never },
      update: { value: value as never },
    });
    await dropAppConfigCache(redis);
    return async () => {
      if (before) {
        await prisma.appConfig.update({ where: { key }, data: { value: before.value as never } });
      } else {
        await prisma.appConfig.deleteMany({ where: { key } });
      }
      await dropAppConfigCache(redis);
      return before ? before.value : '(default)';
    };
  }

  async function uploadFile(a: Auth, purpose: string, mime: string, data: Buffer) {
    const p = await api()
      .post('/api/v1/files/presign')
      .set(a)
      .send({ purpose, mime, sizeBytes: data.length, sha256: sha(data) });
    if (p.status !== 201) return { status: p.status, code: p.body?.error?.code as string };
    const up = p.body.data.upload as { url: string; fields: Record<string, string> };
    const form = new FormData();
    for (const [k, v] of Object.entries(up.fields)) form.append(k, v);
    form.append('file', new Blob([new Uint8Array(data)], { type: mime }));
    const put = await fetch(up.url, { method: 'POST', body: form });
    expect(put.status).toBe(204);
    const fileId = p.body.data.fileId as string;
    await api().post(`/api/v1/files/${fileId}/confirm`).set(a).expect(200);
    let f: Record<string, unknown> = {};
    for (let i = 0; i < 150; i += 1) {
      f = (await api().get(`/api/v1/files/${fileId}`).set(a).expect(200)).body.data;
      if (f.scanStatus !== 'pending') break;
      await sleep(200);
    }
    const bucket = new URL(up.url).pathname.replace(/^\//, '').split('/')[0];
    return { status: 201, fileId, bucket, uploadUrl: up.url, file: f };
  }

  /** A real-looking phone photo: 4032×3024 noise, JPEG q92, EXIF with GPS. */
  async function phonePhoto() {
    const w = 4032;
    const h = 3024;
    const raw = Buffer.alloc(w * h * 3);
    for (let i = 0; i < raw.length; i += 1) raw[i] = (i * 2654435761) >>> 24;
    return sharp(raw, { raw: { width: w, height: h, channels: 3 } })
      .blur(1.2)
      .jpeg({ quality: 92 })
      .withMetadata({
        orientation: 1,
        exif: {
          IFD0: { Make: 'Apple', Model: 'iPhone 17 Pro', Artist: 'gps-leak-marker' },
          IFD3: {
            GPSLatitudeRef: 'N',
            GPSLatitude: '36/1 10/1 30/1',
            GPSLongitudeRef: 'W',
            GPSLongitude: '115/1 8/1 11/1',
          },
        },
      })
      .toBuffer();
  }

  // ---------- likes ----------
  it('P1: 50 people like in parallel → counter 50, 50 rows', async () => {
    const author = await user('attorney', 'Author');
    const id = await newPost(author.auth);
    const fans = await Promise.all(Array.from({ length: 50 }, () => user('client')));
    const codes = await Promise.all(
      fans.map((f) => api().post(`/api/v1/posts/${id}/like`).set(f.auth).then((r) => r.status)),
    );
    await flush();
    const rows = await prisma.postLike.count({ where: { post_id: id } });
    const shown = (await api().get(`/api/v1/posts/${id}`).set(author.auth)).body.data.likeCount;
    const db = (await prisma.post.findUniqueOrThrow({ where: { id } })).like_count;
    const notes = await prisma.notification.findMany({
      where: { user_id: author.id, type: 'post_like' },
      select: { aggregate_count: true },
    });
    log('P1', { statuses: [...new Set(codes)], rows, shown, db, notifRows: notes.length, notifAgg: notes.map((n) => n.aggregate_count) });
    expect(rows).toBe(50);
    expect(shown).toBe(50);
    expect(db).toBe(50);
  });

  it('P2: one person double-taps 20× at once, then like/unlike race → counter = rows, one notification', async () => {
    const author = await user('attorney', 'Author2');
    const id = await newPost(author.auth);
    const fan = await user('client');
    const codes = await Promise.all(
      Array.from({ length: 20 }, () => api().post(`/api/v1/posts/${id}/like`).set(fan.auth).then((r) => r.status)),
    );
    await flush();
    const rows1 = await prisma.postLike.count({ where: { post_id: id } });
    const db1 = (await prisma.post.findUniqueOrThrow({ where: { id } })).like_count;
    // interleaved like / unlike from the same person
    const mix = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        (i % 2 ? api().delete(`/api/v1/posts/${id}/like`) : api().post(`/api/v1/posts/${id}/like`))
          .set(fan.auth)
          .then((r) => r.status),
      ),
    );
    await flush();
    const rows2 = await prisma.postLike.count({ where: { post_id: id } });
    const db2 = (await prisma.post.findUniqueOrThrow({ where: { id } })).like_count;
    const shown2 = (await api().get(`/api/v1/posts/${id}`).set(fan.auth)).body.data;
    // like → unlike → like again: still one notification row
    await api().delete(`/api/v1/posts/${id}/like`).set(fan.auth);
    await api().post(`/api/v1/posts/${id}/like`).set(fan.auth);
    await flush();
    await sleep(1500);
    const notes = await prisma.notification.findMany({
      where: { user_id: author.id, type: 'post_like' },
      select: { aggregate_count: true, payload: true },
    });
    log('P2', {
      doubleTapStatuses: codes.reduce<Record<number, number>>((m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }), {}),
      rows1, db1,
      mixStatuses: mix.reduce<Record<number, number>>((m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }), {}),
      rows2, db2, shownCount: shown2.likeCount, shownLiked: shown2.likedByMe ?? shown2.isLiked,
      notifRows: notes.length, notifAgg: notes.map((n) => n.aggregate_count),
    });
    expect(rows1).toBe(1);
    expect(db1).toBe(1);
    expect(db2).toBe(rows2);
    expect(notes.length).toBe(1);
  });

  it('P3: the author likes his own post → no notification to himself', async () => {
    const author = await user('attorney', 'Self');
    const id = await newPost(author.auth);
    await api().post(`/api/v1/posts/${id}/like`).set(author.auth);
    await sleep(800);
    const n = await prisma.notification.count({ where: { user_id: author.id } });
    log('P3', { selfLikeStatusRows: await prisma.postLike.count({ where: { post_id: id } }), notifications: n });
    expect(n).toBe(0);
  });

  // ---------- comments ----------
  it('P4: comment, reply, reply-to-reply, 20 parallel comment likes, delete → counters right', async () => {
    const author = await user('attorney', 'CAuthor');
    const id = await newPost(author.auth);
    const b = await user('client', 'Bob');
    const c = await user('client', 'Cat');
    const topR = await api().post(`/api/v1/posts/${id}/comments`).set(b.auth).send({ body: 'first' });
    const top = topR.body.data;
    const r1R = await api().post(`/api/v1/posts/${id}/comments`).set(c.auth).send({ body: 'reply', parentCommentId: top.id });
    log('P4a', { top: [topR.status, topR.body?.error ?? null], reply: [r1R.status, r1R.body?.error ?? null] });
    const r1 = r1R.body.data;
    const r2 = await api().post(`/api/v1/posts/${id}/comments`).set(b.auth).send({ body: 'reply2', parentCommentId: r1.id });
    const likes = await Promise.all(
      Array.from({ length: 20 }, () => api().post(`/api/v1/comments/${top.id}/like`).set(c.auth).then((r) => r.status)),
    );
    await flush();
    const topRow = await prisma.comment.findUniqueOrThrow({ where: { id: top.id } });
    const likeRows = await prisma.commentLike.count({ where: { comment_id: top.id } });
    const postBefore = await prisma.post.findUniqueOrThrow({ where: { id } });
    const del = await api().delete(`/api/v1/comments/${r1.id}`).set(c.auth);
    await flush();
    const postAfter = await prisma.post.findUniqueOrThrow({ where: { id } });
    const topAfter = await prisma.comment.findUniqueOrThrow({ where: { id: top.id } });
    const list = await api().get(`/api/v1/posts/${id}/comments`).set(b.auth);
    const etag = list.headers.etag;
    const again = await api().get(`/api/v1/posts/${id}/comments`).set(b.auth).set('If-None-Match', etag);
    const editRoute = await api().patch(`/api/v1/comments/${top.id}`).set(b.auth).send({ body: 'edited' });
    const notes = await prisma.notification.groupBy({
      by: ['type'],
      where: { user_id: { in: [author.id, b.id, c.id] } },
      _count: true,
    });
    log('P4', {
      replyToReplyParent: r2.body.data?.parentCommentId ?? r2.body.data?.parentId, topId: top.id,
      commentLikeStatuses: [...new Set(likes)], commentLikeRows: likeRows, commentLikeCount: topRow.like_count,
      replyCountBefore: topRow.reply_count, replyCountAfter: topAfter.reply_count,
      postCommentsBefore: postBefore.comment_count, deleteStatus: del.status, postCommentsAfter: postAfter.comment_count,
      listEtag: etag, secondListStatus: again.status, editStatus: editRoute.status,
      notifications: notes.map((n) => `${n.type}:${n._count}`),
    });
    expect(likeRows).toBe(1);
    expect(topRow.like_count).toBe(1);
    expect(again.status).toBe(304);
  });

  it('P5: comments off → refused; on again → allowed', async () => {
    const author = await user('attorney', 'Off');
    const id = await newPost(author.auth);
    const b = await user('client');
    const off = await api().patch(`/api/v1/posts/${id}/comments-setting`).set(author.auth).send({ enabled: false });
    const tryOff = await api().post(`/api/v1/posts/${id}/comments`).set(b.auth).send({ body: 'x' });
    const on = await api().patch(`/api/v1/posts/${id}/comments-setting`).set(author.auth).send({ enabled: true });
    const tryOn = await api().post(`/api/v1/posts/${id}/comments`).set(b.auth).send({ body: 'x' });
    log('P5', { off: off.status, offBody: off.body?.error?.code, whenOff: [tryOff.status, tryOff.body?.error?.code], on: on.status, whenOn: tryOn.status });
    expect(tryOff.status).toBeGreaterThanOrEqual(400);
    expect(tryOn.status).toBe(201);
  });

  it('P6: mention in a comment → one notification; mention twice → still one', async () => {
    const author = await user('attorney', 'Men');
    const target = await user('attorney', 'Target');
    const id = await newPost(author.auth);
    const b = await user('client');
    await api().post(`/api/v1/posts/${id}/comments`).set(b.auth).send({ body: `hi @${target.username} and @${target.username}` });
    await sleep(1500);
    const n = await prisma.notification.findMany({ where: { user_id: target.id }, select: { type: true, aggregate_count: true } });
    log('P6', { notifications: n });
    expect(n.filter((x) => String(x.type).includes('mention')).length).toBe(1);
  });

  // ---------- blocks ----------
  it('P7: blocked person cannot like/comment/repost; his old like leaves the likers list', async () => {
    const author = await user('attorney', 'Blk');
    const id = await newPost(author.auth);
    const bad = await user('client', 'Bad');
    await api().post(`/api/v1/posts/${id}/like`).set(bad.auth).expect(204);
    const blk = await api().put(`/api/v1/users/${bad.id}/block`).set(author.auth);
    const like = await api().post(`/api/v1/posts/${id}/like`).set(bad.auth);
    const com = await api().post(`/api/v1/posts/${id}/comments`).set(bad.auth).send({ body: 'x' });
    const rep = await api().post(`/api/v1/posts/${id}/repost`).set(bad.auth);
    const view = await api().get(`/api/v1/posts/${id}`).set(bad.auth);
    const likers = await api().get(`/api/v1/posts/${id}/likes`).set(author.auth);
    const ids = ((likers.body.data ?? []) as { id?: string; userId?: string }[]).map((x) => x.id ?? x.userId);
    log('P7', { block: blk.status, like: [like.status, like.body?.error?.code], comment: [com.status, com.body?.error?.code], repost: [rep.status, rep.body?.error?.code], viewPost: view.status, blockedInLikers: ids.includes(bad.id) });
    await api().delete(`/api/v1/users/${bad.id}/block`).set(author.auth);
    expect(com.status).toBeGreaterThanOrEqual(400);
    expect(ids.includes(bad.id)).toBe(false);
  });

  // ---------- save / share / repost ----------
  it('P8: save twice, 10 parallel reposts, share → counters exact', async () => {
    const author = await user('attorney', 'Sv');
    const id = await newPost(author.auth);
    const b = await user('client');
    const s1 = await api().post('/api/v1/saved-items').set(b.auth).send({ itemType: 'post', itemId: id });
    const s2 = await api().post('/api/v1/saved-items').set(b.auth).send({ itemType: 'post', itemId: id });
    const reposts = await Promise.all(
      Array.from({ length: 10 }, () => api().post(`/api/v1/posts/${id}/repost`).set(b.auth).then((r) => r.status)),
    );
    const sh = await api().post(`/api/v1/posts/${id}/share`).set(b.auth).send({});
    await flush();
    const p = await prisma.post.findUniqueOrThrow({ where: { id } });
    const savedRows = await prisma.savedItem.count({ where: { item_id: id } as never });
    const repostRows = await prisma.postRepost.count({ where: { post_id: id } });
    log('P8', { save: [s1.status, s2.status], savedRows, saveCount: p.save_count, repostStatuses: [...new Set(reposts)], repostRows, repostCountApi: (await api().get(`/api/v1/posts/${id}`).set(b.auth)).body.data.repostCount, share: sh.status, shareCount: p.share_count });
    expect(savedRows).toBe(1);
    expect(repostRows).toBe(1);
  });

  it('P9: hide counters on/off through the API', async () => {
    const author = await user('attorney', 'Hid');
    const id = await newPost(author.auth);
    const b = await user('client');
    await api().post(`/api/v1/posts/${id}/like`).set(b.auth);
    await flush();
    await api().patch(`/api/v1/posts/${id}/counters`).set(author.auth).send({ hideLikes: true });
    const hidden = (await api().get(`/api/v1/posts/${id}`).set(b.auth)).body.data;
    await api().patch(`/api/v1/posts/${id}/counters`).set(author.auth).send({ hideLikes: false });
    const shown = (await api().get(`/api/v1/posts/${id}`).set(b.auth)).body.data;
    log('P9', { hidden: [hidden.likeCount, hidden.likesHidden], shown: [shown.likeCount, shown.likesHidden] });
    expect(hidden.likeCount).toBe(0);
    expect(shown.likeCount).toBe(1);
  });

  it('P10: feed and post answers carry ETag and give 304', async () => {
    const author = await user('attorney', 'Et');
    const id = await newPost(author.auth);
    const b = await user('client');
    const out: Record<string, unknown> = {};
    for (const path of [`/api/v1/posts/${id}`, '/api/v1/feed', `/api/v1/attorneys/${author.id}/posts`, '/api/v1/saved-items/posts']) {
      const r1 = await api().get(path).set(b.auth);
      const r2 = r1.headers.etag
        ? await api().get(path).set(b.auth).set('If-None-Match', r1.headers.etag)
        : null;
      out[path.replace(id, ':id').replace(author.id, ':aid')] = [r1.status, r1.headers.etag ?? null, r2?.status ?? null, r1.headers['cache-control'] ?? null];
    }
    log('P10', out);
  });

  // ---------- media ----------
  it('P11: phone photo with GPS → post photo: GPS gone, ≤2048 px, WebP + AVIF twin + 320/1080, DB holds only the key', async () => {
    const a = await user('attorney', 'Photo');
    const data = await phonePhoto();
    const inMeta = await sharp(data).metadata();
    const up = await uploadFile(a.auth, 'post_image', 'image/jpeg', data);
    expect(up.status).toBe(201);
    const row = await prisma.file.findUniqueOrThrow({ where: { id: up.fileId! } });
    const stored = await storage.read(up.bucket!, row.s3_key);
    const meta = await sharp(stored).metadata();
    const vars: Record<string, unknown> = {};
    for (const px of [320, 1080]) {
      const v = await storage.read(up.bucket!, variantKey(row.s3_key, px)).catch(() => null);
      vars[`w${px}`] = v ? { bytes: v.length, ...(({ width, height, format }) => ({ width, height, format }))(await sharp(v).metadata()) } : null;
    }
    const av = await storage.read(up.bucket!, avifKey(row.s3_key)).catch(() => null);
    const cols = Object.keys(row);
    const postId = await newPost(a.auth, { mediaFileIds: [up.fileId] });
    const post = (await api().get(`/api/v1/posts/${postId}`).set(a.auth)).body.data;
    const media = (post.media ?? post.images ?? [])[0] ?? null;
    const unsignedKey = `${new URL(up.uploadUrl!).origin}/${up.bucket}/${row.s3_key}`;
    const unsigned = await fetch(unsignedKey);
    log('P11', {
      inBytes: data.length, inSize: `${inMeta.width}x${inMeta.height}`, inHasExif: !!inMeta.exif,
      file: up.file,
      storedBytes: stored.length, storedFormat: meta.format, storedSize: `${meta.width}x${meta.height}`,
      storedHasExif: !!meta.exif, gpsMarkerInBytes: stored.includes('gps-leak-marker'),
      ratio: +(stored.length / data.length).toFixed(3),
      variants: vars, avif: av ? { bytes: av.length, format: (await sharp(av).metadata()).format } : null,
      dbColumns: cols, dbKey: row.s3_key,
      postMedia: media, unsignedGet: unsigned.status,
    });
    expect(meta.exif).toBeUndefined();
    expect(stored.includes('gps-leak-marker')).toBe(false);
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(2048);
  });

  it('P12: admin quality setting changes the bytes (images.webp_quality 88 → 40 → back)', async () => {
    const a = await user('attorney', 'Q');
    const data = await phonePhoto();
    const one = await uploadFile(a.auth, 'post_image', 'image/jpeg', data);
    const r1 = await prisma.file.findUniqueOrThrow({ where: { id: one.fileId! } });
    const restore = await setConfig('images.webp_quality', 40);
    // a different photo (dedup would hand back the first one)
    const data2 = await sharp(data).rotate(180).jpeg({ quality: 92 }).toBuffer();
    const two = await uploadFile(a.auth, 'post_image', 'image/jpeg', data2);
    const r2 = await prisma.file.findUniqueOrThrow({ where: { id: two.fileId! } });
    const was = await restore();
    log('P12', { setting: { before: was, test: 40, restored: was }, bytesQ88: r1.size_bytes, bytesQ40: r2.size_bytes });
    expect(Number(r2.size_bytes)).toBeLessThan(Number(r1.size_bytes));
  });

  it('P13: admin upload limit is obeyed at once (post photo MB → 1 → back)', async () => {
    const a = await user('attorney', 'Lim');
    const data = await phonePhoto();
    const cur = await prisma.appConfig.findUnique({ where: { key: 'uploads.limits' } });
    const limits = (cur?.value as Record<string, Record<string, unknown>> | undefined) ?? {};
    // A: only «Посты» = 1 MB (a post photo may also go to a reel: the wider limit applies at upload,
    //    the post's own limit when the photo is attached)
    const restoreA = await setConfig('uploads.limits', { ...limits, post: { ...(limits.post ?? {}), fileMb: 1 } });
    const upA = await uploadFile(a.auth, 'post_image', 'image/jpeg', data);
    const attachA = upA.fileId
      ? await api().post('/api/v1/posts').set(a.auth).set('Idempotency-Key', randomUUID())
          .send({ title: 'L', practiceCode: 'family_law', body: 'limit', mediaFileIds: [upA.fileId] })
      : null;
    await restoreA();
    // B: «Посты» and «Рилсы» = 1 MB
    const restoreB = await setConfig('uploads.limits', {
      ...limits,
      post: { ...(limits.post ?? {}), fileMb: 1 },
      reel: { ...(limits.reel ?? {}), fileMb: 1 },
    });
    const upB = await uploadFile(a.auth, 'post_image', 'image/jpeg', await sharp(data).rotate(90).jpeg({ quality: 92 }).toBuffer());
    const was = await restoreB();
    const after = await uploadFile(a.auth, 'post_image', 'image/jpeg', await sharp(data).flip().jpeg({ quality: 92 }).toBuffer());
    log('P13', {
      setting: { before: was, test: 'A: post.fileMb=1; B: post+reel fileMb=1', restored: was },
      photoBytes: data.length,
      A_upload: [upA.status, upA.code ?? null], A_attachToPost: attachA ? [attachA.status, attachA.body?.error?.code ?? null] : null,
      B_upload: [upB.status, upB.code ?? null], afterRestore: after.status,
    });
    expect(upB.status).toBe(400);
    expect(after.status).toBe(201);
  });

  it('P14: private document in a post (post_attachment) has no public URL; signed link works and expires', async () => {
    const a = await user('attorney', 'Doc');
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n', 'latin1');
    const up = await uploadFile(a.auth, 'post_attachment', 'application/pdf', pdf);
    const row = await prisma.file.findUniqueOrThrow({ where: { id: up.fileId! } });
    const origin = new URL(up.uploadUrl!).origin;
    const unsigned = await fetch(`${origin}/${up.bucket}/${row.s3_key}`);
    const url = (up.file as { url?: string }).url ?? null;
    const signed = url ? await fetch(url) : null;
    const exp = url ? new URL(url).searchParams.get('X-Amz-Expires') : null;
    log('P14', { bucket: up.bucket, scan: (up.file as { scanStatus: string }).scanStatus, unsignedGet: unsigned.status, signedGet: signed?.status ?? null, signedTtlSec: exp });
    expect(unsigned.status).toBe(403);
  });

  it('P15: delete a post → its photo is released and the objects are removed by the cleanup (retention 30 d → 0 → back)', async () => {
    const a = await user('attorney', 'Del');
    const data = await sharp(await phonePhoto()).rotate(270).jpeg().toBuffer();
    const up = await uploadFile(a.auth, 'post_image', 'image/jpeg', data);
    const postId = await newPost(a.auth, { mediaFileIds: [up.fileId] });
    const row = await prisma.file.findUniqueOrThrow({ where: { id: up.fileId! } });
    await api().delete(`/api/v1/posts/${postId}`).set(a.auth).expect(200);
    const keys = [row.s3_key, variantKey(row.s3_key, 320), variantKey(row.s3_key, 1080), avifKey(row.s3_key)];
    const before = await Promise.all(keys.map((k) => storage.head(up.bucket!, k).then((h) => !!h)));
    const r1 = await setConfig('storage.deleted_posts_media_days', 0);
    const r2 = await setConfig('legal.deleted_retention_days', 0);
    const r3 = await setConfig('storage.purge_after_days', 0);
    const r4 = await setConfig('storage.orphan_grace_hours', 1);
    // pretend the file is old enough (grace is ≥ 1 h by design)
    await prisma.file.update({ where: { id: up.fileId! }, data: { created_at: new Date(Date.now() - 2 * 3600_000) } });
    // retention has a floor of 1 day in code (postMediaRetentionDays) → the clock of the run is moved 2 and 3 days on
    const pass1 = await app.get(StorageCleanupService).runNow(new Date(Date.now() + 2 * 86_400_000));
    const pass2 = await app.get(StorageCleanupService).runNow(new Date(Date.now() + 3 * 86_400_000));
    const after = await Promise.all(keys.map((k) => storage.head(up.bucket!, k).then((h) => !!h)));
    const rowAfter = await prisma.file.findUnique({ where: { id: up.fileId! } });
    const restored = [await r4(), await r3(), await r2(), await r1()];
    log('P15', { settings: { keys: ['orphan_grace_hours', 'purge_after_days', 'legal.deleted_retention_days', 'deleted_posts_media_days'], before: restored, test: [1, 0, 0, 0], restored }, objectsBefore: before, pass1, pass2, objectsAfter: after, rowAfter: rowAfter ? { deleted_at: rowAfter.deleted_at, reason: rowAfter.deleted_reason, purged_at: rowAfter.purged_at } : 'row removed' });
    expect(after.every((x) => !x)).toBe(true);
  });

  it('P16: the database keeps no file bytes (no bytea columns anywhere)', async () => {
    const rows = await prisma.$queryRawUnsafe<{ table_name: string; column_name: string }[]>(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' AND data_type='bytea' ORDER BY 1,2`,
    );
    log('P16', { byteaColumns: rows });
  });

  it('P17: payments — where the monthly price comes from (env STRIPE_PRICE_ID as the server sees it)', async () => {
    const { ConfigService } = await import('@nestjs/config');
    const { PricingService } = await import('../src/modules/billing/pricing.service');
    const cfg = app.get(ConfigService);
    const raw = process.env.STRIPE_PRICE_ID;
    const seen = cfg.get<string>('STRIPE_PRICE_ID');
    const price = await app.get(PricingService).priceId('monthly');
    const att = await user('attorney', 'Pay');
    const start = await api().post('/api/v1/subscriptions/start').set(att.auth);
    log('P17', { processEnv: raw === undefined ? '(unset)' : JSON.stringify(raw), configGet: seen === undefined ? '(undefined)' : JSON.stringify(seen), monthlyPriceId: price ?? null, start: [start.status, start.body?.error?.code ?? 'ok'] });
  });
});
