/**
 * Проверка 17.11, пачка 2 (рилсы и видео, истории, подписки и рекомендации).
 * Живые HTTP-запросы к API внутри набора, настоящие Postgres и Redis Мака;
 * Bunny Stream подменён записывающей заглушкой (сеть не нужна).
 * Запуск: docs/dev/verify/v9-run.sh v9-batch2-probe — строки "V9 <номер> {...}".
 */
import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { FeatureFlagsService } from '../src/modules/feature-flags/services/feature-flags.service';
import { BunnyStreamClient } from '../src/modules/videos/bunny-stream.client';
import { PostVideosService } from '../src/modules/posts/post-videos.service';
import { VideosService } from '../src/modules/videos/videos.service';
import { ensurePostPractices } from './support/post-practices';

jest.setTimeout(300_000);
type Auth = Record<string, string>;
const log = (id: string, o: unknown) => process.stdout.write(`V9 ${id} ${JSON.stringify(o)}\n`);

describe('verify batch 2 probe 17.11', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let base = '';
  const api = () => request(base);
  const deletedAtBunny: string[] = [];
  const fakeBunny = {
    devFake: false,
    keys: () =>
      Promise.resolve({
        libraryId: '42',
        cdnHostname: 'vz-test.b-cdn.net',
        apiKey: 'k',
        tokenAuthKey: 't',
        webhookToken: 'w',
      }),
    tusEndpoint: () => 'https://video.bunnycdn.com/tusupload',
    cdnScheme: () => 'https' as const,
    apiBase: () => 'https://video.bunnycdn.com',
    createVideo: () => Promise.resolve(randomUUID()),
    getVideo: (guid: string) =>
      Promise.resolve({ guid, status: 4, length: 5, width: 720, height: 1280, storageSize: 1000 }),
    deleteVideo: (guid: string) => {
      deletedAtBunny.push(guid);
      return Promise.resolve();
    },
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const m = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(BunnyStreamClient)
      .useValue(fakeBunny)
      .compile();
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
    await prisma.featureFlag.upsert({
      where: { key: 'video_posts' },
      create: { key: 'video_posts', enabled: true },
      update: { enabled: true },
    });
    await app.get(FeatureFlagsService).invalidate();
    await app.get<import('ioredis').default>(REDIS_CLIENT).del('config:app_config');
  });
  afterAll(async () => {
    await prisma.featureFlag.updateMany({ where: { key: 'video_posts' }, data: { enabled: false } });
    await app.get(FeatureFlagsService).invalidate();
    await app.close();
  });

  async function user(role: 'client' | 'attorney') {
    const u = await prisma.user.create({ data: { role, first_name: 'V', last_name: 'Probe' } });
    if (role === 'attorney') {
      const username = `v9b${u.id.slice(0, 8)}`;
      await prisma.attorneyProfile.create({
        data: { user_id: u.id, username, username_lower: username, languages: ['en'], verification_status: 'verified' },
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

  async function reel(a: Auth) {
    const up = await api().post('/api/v1/videos/uploads').set(a).send({ sizeBytes: 1000, durationSec: 5 });
    expect(up.status).toBe(201);
    const assetId = up.body.data.videoAssetId as string;
    const r = await api()
      .post('/api/v1/posts')
      .set(a)
      .set('Idempotency-Key', randomUUID())
      .send({ title: 'Reel', practiceCode: 'family_law', body: 'Five seconds.', videoAssetId: assetId });
    expect(r.status).toBe(201);
    return { assetId, postId: r.body.data.id as string };
  }

  it('V1 deleting a reel deletes its video at Bunny', async () => {
    const att = await user('attorney');
    const { assetId, postId } = await reel(att.auth);
    const asset = await prisma.videoAsset.findUniqueOrThrow({ where: { id: assetId } });
    await api().delete(`/api/v1/posts/${postId}`).set(att.auth).expect(200);
    const row = await prisma.$queryRaw<{ status: string; purged: boolean }[]>`
      SELECT status::text, purged_at IS NOT NULL AS purged FROM video_assets WHERE id = ${assetId}::uuid`;
    log('V1', { bunnyDeleteCalled: deletedAtBunny.includes(asset.external_id), row: row[0] });
    expect(deletedAtBunny).toContain(asset.external_id);
    expect(row[0].purged).toBe(true);
  });

  it('V2 the sweep retries Bunny for an asset deleted here but still there', async () => {
    const att = await user('attorney');
    const up = await api().post('/api/v1/videos/uploads').set(att.auth).send({ sizeBytes: 1000, durationSec: 5 });
    const id = up.body.data.videoAssetId as string;
    const asset = await prisma.videoAsset.findUniqueOrThrow({ where: { id } });
    // A story / channel / moderation delete only marks it (purge left to the sweep).
    await app.get(VideosService).markDeleted([id]);
    const stats = await app.get(PostVideosService).sweep();
    const row = await prisma.$queryRaw<{ purged: boolean }[]>`
      SELECT purged_at IS NOT NULL AS purged FROM video_assets WHERE id = ${id}::uuid`;
    log('V2', { purgedBySweep: stats.purged ?? 0, bunnyDeleteCalled: deletedAtBunny.includes(asset.external_id), purged: row[0].purged });
    expect(row[0].purged).toBe(true);
  });

  it('V3 a video used by a story cannot be cancelled', async () => {
    const att = await user('attorney');
    const up = await api().post('/api/v1/videos/uploads').set(att.auth).send({ sizeBytes: 1000, durationSec: 5 });
    const id = up.body.data.videoAssetId as string;
    await prisma.videoAsset.update({ where: { id }, data: { status: 'ready' } });
    await prisma.story.create({
      data: {
        author_id: att.id,
        kind: 'video',
        video_asset_id: id,
        expires_at: new Date(Date.now() + 86_400_000),
      } as never,
    });
    const r = await api().delete(`/api/v1/videos/${id}`).set(att.auth);
    const row = await prisma.$queryRaw<{ status: string }[]>`
      SELECT status::text FROM video_assets WHERE id = ${id}::uuid`;
    log('V3', { cancel: r.status, assetStatus: row[0].status });
    expect(r.status).toBe(409);
  });

  it('F1 a client following, unfollowing and following again notifies once', async () => {
    const att = await user('attorney');
    const c = await user('client');
    for (let i = 0; i < 3; i += 1) {
      await api().post(`/api/v1/attorneys/${att.id}/follow`).set(c.auth);
      await api().delete(`/api/v1/attorneys/${att.id}/follow`).set(c.auth);
    }
    await api().post(`/api/v1/attorneys/${att.id}/follow`).set(c.auth);
    const rows = await prisma.notification.findMany({
      where: { user_id: att.id, type: 'new_follower' },
      select: { aggregate_count: true },
    });
    const followRows = await prisma.follow.count({ where: { followee_id: att.id } });
    log('F1', { notificationRows: rows.length, aggregate: rows.map((r) => r.aggregate_count), followRows });
    expect(rows.map((r) => r.aggregate_count)).toEqual([1]);
    expect(followRows).toBe(1);
  });
});
