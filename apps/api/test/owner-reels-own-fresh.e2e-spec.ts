import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { PostsService } from '../src/modules/posts/posts.service';
import { FeatureFlagsService } from '../src/modules/feature-flags/services/feature-flags.service';
import { BunnyStreamClient } from '../src/modules/videos/bunny-stream.client';

/**
 * 18.11 (owner's Samsung, signed in as an attorney): his 2 ready reels were
 * in the posts feed but the «Рилсы» tab said «Пока нет рилсов». Cause: the
 * ranked reels list (`reco.reels_ranked`, on) dropped the viewer's own
 * posts — a Search rule — and an empty ranked page was returned as is, so
 * the newest-first list never ran. A signed-in viewer must see ready reels,
 * their own fresh one first (Instagram).
 */
jest.setTimeout(120_000);

describe('Reels for a signed-in viewer: own fresh reels (e2e, 18.11)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let base = '';
  // Reels need Bunny keys (VideosService.assertAvailable); no network here.
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
    ownWebhookUrl: () => null,
    deleteVideo: () => Promise.resolve(),
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(BunnyStreamClient)
      .useValue(fakeBunny)
      .compile();
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
    await prisma.featureFlag.upsert({
      where: { key: 'video_posts' },
      create: { key: 'video_posts', enabled: true },
      update: { enabled: true },
    });
    await app.get(FeatureFlagsService).invalidate();
  });

  afterAll(async () => {
    await prisma.featureFlag.updateMany({
      where: { key: 'video_posts' },
      data: { enabled: false },
    });
    await app.get(FeatureFlagsService).invalidate();
    await app.close();
  });

  const api = () => request(base);
  const auth = (id: string) => ({
    Authorization: `Bearer ${tokens.signAccessToken({
      sub: id,
      role: 'attorney',
      sid: randomUUID(),
      verified: true,
      subscriptionStatus: 'none',
    })}`,
  });

  async function attorney() {
    const u = await prisma.user.create({
      data: { role: 'attorney', first_name: 'Own', last_name: 'Reels' },
    });
    const username = `or${u.id.slice(0, 10)}`;
    await prisma.attorneyProfile.create({
      data: {
        user_id: u.id,
        username,
        username_lower: username,
        languages: ['en'],
        verification_status: 'verified',
      },
    });
    return { id: u.id, auth: auth(u.id) };
  }

  /** A reel whose video just became ready (the webhook path: the post goes
   * public through PostsService.afterPublish). */
  async function publishReel(authorId: string) {
    const asset = await prisma.videoAsset.create({
      data: {
        owner_user_id: authorId,
        library_id: 'lib',
        external_id: `or-${randomUUID()}`,
        status: 'ready',
        upload_expires_at: new Date(Date.now() + 86_400_000),
        ready_at: new Date(),
      },
    });
    const post = await prisma.post.create({
      data: { author_id: authorId, body: 'Reel', video_asset_id: asset.id },
    });
    await app.get(PostsService).afterPublish(post.id);
    return post.id;
  }

  const ids = (res: { body: { data: { id: string }[] } }) =>
    res.body.data.map((p) => p.id);

  it('the author sees the reel they just published, first, in GET /reels', async () => {
    const a = await attorney();
    // The tab was opened before (an empty ranked list read and cached).
    expect((await api().get('/api/v1/reels').set(a.auth)).status).toBe(200);
    const first = await publishReel(a.id);
    const res = await api().get('/api/v1/reels').set(a.auth);
    expect(res.status).toBe(200);
    expect(ids(res)[0]).toBe(first);
    // A second one: both are there, the newest first.
    const second = await publishReel(a.id);
    const again = ids(await api().get('/api/v1/reels').set(a.auth));
    expect(again.slice(0, 2)).toEqual([second, first]);
  });

  it('the ranked pages never repeat a reel, also when a fresh first page is read mid-scroll', async () => {
    const a = await attorney();
    for (let i = 0; i < 3; i += 1) await publishReel(a.id);
    const p1 = await api().get('/api/v1/reels').query({ limit: 1 }).set(a.auth);
    expect(p1.status).toBe(200);
    // The Reels screen's fresh mix reads page 1 again while scrolling.
    await publishReel(a.id);
    await api().get('/api/v1/reels').query({ limit: 1 }).set(a.auth);
    const seen = new Set(ids(p1));
    let cursor = p1.body.meta?.nextCursor as string | undefined;
    for (let n = 0; cursor && n < 3; n += 1) {
      const next = await api()
        .get('/api/v1/reels')
        .query({ limit: 1, cursor })
        .set(a.auth);
      expect(next.status).toBe(200);
      for (const id of ids(next)) {
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
      cursor = next.body.meta?.nextCursor as string | undefined;
    }
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });
});
