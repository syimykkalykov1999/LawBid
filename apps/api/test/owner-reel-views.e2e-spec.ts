import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { PostEventsService } from '../src/modules/posts/post-events.service';

/** Owner 2026-10-18: profile tabs Посты | Рилсы | Брифы и репосты — the
 * attorney's posts filtered by media (video / visual / text), and reel
 * views counted once per viewer per 24 h (post_view_events), never the
 * author's own, returned as viewCount. */
jest.setTimeout(120_000);

describe('Reel views and profile media tabs (e2e)', () => {
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

  async function attorney() {
    const u = await prisma.user.create({
      data: { role: 'attorney', first_name: 'Reel', last_name: 'Maker' },
    });
    const username = `rv${u.id.slice(0, 10)}`;
    await prisma.attorneyProfile.create({
      data: {
        user_id: u.id,
        username,
        username_lower: username,
        languages: ['en'],
        verification_status: 'verified',
      },
    });
    return { id: u.id, auth: auth(u.id, 'attorney') };
  }

  async function client() {
    const tag = randomUUID().replace(/-/g, '').slice(0, 10);
    const u = await prisma.user.create({
      data: {
        role: 'client',
        first_name: 'View',
        last_name: 'Er',
        client_profile: {
          create: {
            state_code: 'NY',
            username: `rw${tag}`,
            username_lower: `rw${tag}`,
          },
        },
      },
    });
    return { id: u.id, auth: auth(u.id, 'client') };
  }

  async function textPost(authorId: string) {
    return (
      await prisma.post.create({ data: { author_id: authorId, body: 'Brief' } })
    ).id;
  }

  async function photoPost(authorId: string) {
    const fileId = randomUUID();
    await prisma.file.create({
      data: {
        id: fileId,
        owner_user_id: authorId,
        purpose: 'post_image',
        s3_bucket: 'lawbid-media',
        s3_key: `posts/${fileId}`,
        mime: 'image/jpeg',
        size_bytes: BigInt(1000),
        sha256: 'a'.repeat(64),
        scan_status: 'clean',
        width: 800,
        height: 600,
      },
    });
    const p = await prisma.post.create({
      data: { author_id: authorId, body: 'Photo' },
    });
    await prisma.postMedia.create({
      data: { post_id: p.id, file_id: fileId, position: 0 },
    });
    return p.id;
  }

  async function videoPost(authorId: string) {
    const asset = await prisma.videoAsset.create({
      data: {
        owner_user_id: authorId,
        library_id: 'lib',
        external_id: `rv-${randomUUID()}`,
        status: 'ready',
        upload_expires_at: new Date(Date.now() + 86_400_000),
        ready_at: new Date(),
      },
    });
    return (
      await prisma.post.create({
        data: { author_id: authorId, body: 'Reel', video_asset_id: asset.id },
      })
    ).id;
  }

  const ids = (res: { body: { data: { id: string }[] } }) =>
    res.body.data.map((p) => p.id);

  it('splits the profile posts by media: video, visual, text', async () => {
    const a = await attorney();
    const viewer = await client();
    const text = await textPost(a.id);
    const photo = await photoPost(a.id);
    const reel = await videoPost(a.id);
    const list = (media?: string) =>
      api()
        .get(`/api/v1/attorneys/${a.id}/posts`)
        .query(media ? { kind: 'post', media } : { kind: 'post' })
        .set(viewer.auth);

    const all = await list();
    expect(all.status).toBe(200);
    expect(new Set(ids(all))).toEqual(new Set([text, photo, reel]));
    expect(ids(await list('video'))).toEqual([reel]);
    expect(ids(await list('visual'))).toEqual([photo]);
    expect(ids(await list('text'))).toEqual([text]);
    expect((await list('nope')).status).toBe(400);
  });

  it('counts a reel view once per viewer per 24 h, never the author', async () => {
    const a = await attorney();
    const v1 = await client();
    const v2 = await client();
    const reel = await videoPost(a.id);
    const view = (u: { auth: Record<string, string> }) =>
      api().post(`/api/v1/posts/${reel}/view`).set(u.auth);
    const viewCount = async (u: { auth: Record<string, string> }) => {
      const res = await api()
        .get(`/api/v1/attorneys/${a.id}/posts`)
        .query({ media: 'video' })
        .set(u.auth);
      expect(res.status).toBe(200);
      return (res.body.data as { id: string; viewCount: number }[]).find(
        (p) => p.id === reel,
      )!.viewCount;
    };

    expect(await viewCount(v1)).toBe(0);
    expect((await view(v1)).status).toBe(204);
    expect(await viewCount(v1)).toBe(1);
    // A repeat (also two at once) within 24 h adds nothing.
    await Promise.all([view(v1), view(v1)]);
    expect(await viewCount(v1)).toBe(1);
    // The author's own view is not counted; the author sees the count.
    expect((await view(a)).status).toBe(204);
    expect(await viewCount(a)).toBe(1);
    await view(v2);
    expect(await viewCount(a)).toBe(2);

    // A day later the same viewer counts again.
    await prisma.postViewEvent.updateMany({
      where: { post_id: reel, viewer_id: v1.id },
      data: { created_at: new Date(Date.now() - 25 * 3600_000) },
    });
    await view(v1);
    expect(await viewCount(a)).toBe(3);

    const events = await prisma.postViewEvent.findMany({
      where: { post_id: reel },
    });
    expect(events).toHaveLength(3);
    expect(events.every((e) => e.kind === 'view')).toBe(true);
    expect(events.some((e) => e.viewer_id === a.id)).toBe(false);
    // "Who has seen it" for recommendations stays one row per viewer.
    expect(await prisma.postView.count({ where: { post_id: reel } })).toBe(2);
  });

  it('other kinds are logged but leave viewCount alone', async () => {
    const a = await attorney();
    const v = await client();
    const reel = await videoPost(a.id);
    const events = app.get(PostEventsService);
    const rec = (
      kind: 'impression' | 'profile_visit',
      viewerId: string | null,
    ) => events.record({ postId: reel, authorId: a.id, viewerId, kind });
    expect(await rec('impression', v.id)).toBe(true);
    expect(await rec('impression', v.id)).toBe(false);
    expect(await rec('profile_visit', v.id)).toBe(true);
    expect(await rec('impression', null)).toBe(true);
    expect(await rec('impression', null)).toBe(true);
    expect(await prisma.postViewEvent.count({ where: { post_id: reel } })).toBe(
      4,
    );
    const post = await prisma.post.findUniqueOrThrow({ where: { id: reel } });
    expect(post.view_count).toBe(0);
  });
});
