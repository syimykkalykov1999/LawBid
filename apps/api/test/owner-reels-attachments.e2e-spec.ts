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
import { ensurePostPractices } from './support/post-practices';

/**
 * Owner 2026-10-05: posts carry up to 9 documents (PDF, Word, text) with
 * signed download links; a reel is cut from a longer video (trim) with a
 * chosen cover frame, and its inner page holds up to 9 photos and up to 9
 * documents.
 */
jest.setTimeout(60_000);

describe('Reels and post documents (e2e, owner 2026-10-05)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let baseUrl = '';
  const created: { title: string; thumbnailTimeMs?: number | null }[] = [];

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
    createVideo: (title: string, thumbnailTimeMs?: number | null) => {
      created.push({ title, thumbnailTimeMs });
      return Promise.resolve(randomUUID());
    },
    getVideo: () => Promise.resolve(null),
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
    baseUrl = `http://127.0.0.1:${((app.getHttpServer() as Server).address() as AddressInfo).port}`;
    prisma = app.get(PrismaService);
    // Owner 2026-10-13: adding files to posts is an admin mode (off by
    // default); these suites are about the files themselves.
    await prisma.appConfig.upsert({
      where: { key: 'attachments_in_posts' },
      create: { key: 'attachments_in_posts', value: 'on_for_all' },
      update: { value: 'on_for_all' },
    });
    await app
      .get<import('ioredis').default>(REDIS_CLIENT)
      .del('config:app_config');
    await ensurePostPractices(prisma);
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

  const api = () => request(baseUrl);

  async function attorney() {
    const u = await prisma.user.create({ data: { role: 'attorney' } });
    const username = `doc_${u.id.slice(0, 8)}`;
    await prisma.attorneyProfile.create({
      data: {
        user_id: u.id,
        username,
        username_lower: username,
        languages: ['en'],
        verification_status: 'verified',
      },
    });
    const token = tokens.signAccessToken({
      sub: u.id,
      role: 'attorney',
      sid: randomUUID(),
      verified: true,
      subscriptionStatus: 'none',
    });
    return { id: u.id, auth: { Authorization: `Bearer ${token}` } };
  }

  async function file(
    ownerId: string,
    purpose: 'post_attachment' | 'post_image' | 'chat_attachment',
    opts: { mime?: string; size?: number; scan?: 'clean' | 'pending' } = {},
  ) {
    const id = randomUUID();
    await prisma.file.create({
      data: {
        id,
        owner_user_id: ownerId,
        purpose,
        s3_bucket:
          purpose === 'post_image' ? 'lawbid-media' : 'lawbid-documents',
        s3_key: `${purpose}/${ownerId}/${id}`,
        mime: opts.mime ?? 'application/pdf',
        size_bytes: BigInt(opts.size ?? 2000),
        sha256: 'b'.repeat(64),
        scan_status: opts.scan ?? 'clean',
      },
    });
    return id;
  }

  const post = (auth: Record<string, string>, body: Record<string, unknown>) =>
    api()
      .post('/api/v1/posts')
      .set(auth)
      .set('Idempotency-Key', randomUUID())
      .send({ title: 'Lease basics', practiceCode: 'family_law', ...body });

  it('a post carries documents in order with signed download links', async () => {
    const att = await attorney();
    const a = await file(att.id, 'post_attachment');
    const b = await file(att.id, 'post_attachment', {
      mime: 'text/plain',
      size: 120,
    });
    const r = await post(att.auth, {
      body: 'Templates inside',
      attachments: [
        { fileId: b, fileName: 'notes.txt' },
        { fileId: a, fileName: '../../Lease Agreement.pdf' },
      ],
    });
    expect(r.status).toBe(201);
    const docs = r.body.data.attachments as {
      fileId: string;
      fileName: string;
      mime: string;
      sizeBytes: number;
      url: string;
      position: number;
    }[];
    expect(docs.map((d) => [d.fileId, d.fileName, d.position])).toEqual([
      [b, 'notes.txt', 0],
      [a, 'Lease Agreement.pdf', 1],
    ]);
    expect(docs[1]).toMatchObject({ mime: 'application/pdf', sizeBytes: 2000 });
    // Saved under its own name, from the private bucket.
    expect(decodeURIComponent(docs[1].url)).toContain(
      'filename="Lease Agreement.pdf"',
    );
    // Readers see the same documents.
    const reader = await attorney();
    const got = await api()
      .get(`/api/v1/posts/${r.body.data.id as string}`)
      .set(reader.auth)
      .expect(200);
    expect(got.body.data.attachments).toHaveLength(2);
  });

  it('refuses a 10th document, a foreign / unscanned / wrong-purpose file, reuse and an oversized set', async () => {
    const att = await attorney();
    const ten = await Promise.all(
      Array.from({ length: 10 }, () => file(att.id, 'post_attachment')),
    );
    const tooMany = await post(att.auth, {
      body: 'x',
      attachments: ten.map((fileId) => ({ fileId, fileName: 'a.pdf' })),
    });
    expect(tooMany.status).toBe(409);

    const other = await attorney();
    const foreign = await post(att.auth, {
      body: 'x',
      attachments: [
        { fileId: await file(other.id, 'post_attachment'), fileName: 'a.pdf' },
      ],
    });
    expect(foreign.status).toBe(404);
    for (const fileId of [
      await file(att.id, 'post_attachment', { scan: 'pending' }),
      await file(att.id, 'chat_attachment'),
    ]) {
      const r = await post(att.auth, {
        body: 'x',
        attachments: [{ fileId, fileName: 'a.pdf' }],
      });
      expect(r.status).toBe(409);
      expect(r.body.error.code).toBe('FILE_NOT_ATTACHABLE');
    }

    const once = await file(att.id, 'post_attachment');
    await post(att.auth, {
      body: 'first',
      attachments: [{ fileId: once, fileName: 'a.pdf' }],
    }).expect(201);
    const again = await post(att.auth, {
      body: 'second',
      attachments: [{ fileId: once, fileName: 'a.pdf' }],
    });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('FILE_NOT_ATTACHABLE');

    // posts.attachments_max_total_mb (30) across the set.
    const big = await Promise.all(
      [0, 1, 2, 3].map(() =>
        file(att.id, 'post_attachment', { size: 9 * 1024 * 1024 }),
      ),
    );
    const heavy = await post(att.auth, {
      body: 'x',
      attachments: big.map((fileId) => ({ fileId, fileName: 'a.pdf' })),
    });
    expect(heavy.status).toBe(400);
    expect(heavy.body.error.code).toBe('FILE_TOO_LARGE');
  });

  it('documents accept only PDF, Word and text at presign, ≤ 10 MB', async () => {
    const att = await attorney();
    const presign = (mime: string, sizeBytes: number) =>
      api()
        .post('/api/v1/files/presign')
        .set(att.auth)
        .send({
          purpose: 'post_attachment',
          mime,
          sizeBytes,
          sha256: 'c'.repeat(64),
        });
    const xls = await presign('application/vnd.ms-excel', 1000);
    expect(xls.status).toBe(400);
    expect(xls.body.error.code).toBe('FILE_TYPE_NOT_ALLOWED');
    const big = await presign('application/pdf', 11 * 1024 * 1024);
    expect(big.status).toBe(400);
    expect(big.body.error.code).toBe('FILE_TOO_LARGE');
  });

  it('a reel is trimmed from a longer video, keeps the cover, and has photos + documents inside', async () => {
    const att = await attorney();
    const upload = (body: Record<string, unknown>) =>
      api().post('/api/v1/videos/uploads').set(att.auth).send(body);

    // Untrimmed and longer than 180 s (3 minutes) → refused; the source
    // cap is 900 s.
    const long = await upload({ sizeBytes: 1000, durationSec: 200 });
    expect(long.status).toBe(422);
    expect(long.body.error.code).toBe('VIDEO_TOO_LONG');
    const tooLongSource = await upload({
      sizeBytes: 1000,
      durationSec: 1000,
      trimStartMs: 0,
      trimEndMs: 60_000,
    });
    expect(tooLongSource.status).toBe(422);
    const tooLongCut = await upload({
      sizeBytes: 1000,
      durationSec: 400,
      trimStartMs: 10_000,
      trimEndMs: 200_000,
    });
    expect(tooLongCut.status).toBe(422);
    const backwards = await upload({
      sizeBytes: 1000,
      durationSec: 60,
      trimStartMs: 30_000,
      trimEndMs: 20_000,
    });
    expect(backwards.status).toBe(422);

    const ok = await upload({
      sizeBytes: 1000,
      durationSec: 400,
      title: 'Know your rights',
      trimStartMs: 20_000,
      trimEndMs: 95_000,
      coverTimeMs: 31_500,
    });
    expect(ok.status).toBe(201);
    expect(created.at(-1)).toEqual({
      title: 'Know your rights',
      thumbnailTimeMs: 31_500,
    });
    const assetId = ok.body.data.videoAssetId as string;
    const photo = await file(att.id, 'post_image', { mime: 'image/jpeg' });
    const doc = await file(att.id, 'post_attachment');
    const r = await post(att.auth, {
      body: 'The full article is inside.',
      videoAssetId: assetId,
      mediaFileIds: [photo],
      attachments: [{ fileId: doc, fileName: 'Checklist.pdf' }],
    });
    expect(r.status).toBe(201);
    expect(r.body.data.status).toBe('processing');
    expect(r.body.data.attachments).toHaveLength(1);
    expect(r.body.data.video).toMatchObject({
      trimStartMs: 20_000,
      trimEndMs: 95_000,
      durationSec: 75,
    });
    const row = await prisma.post.findUniqueOrThrow({
      where: { id: r.body.data.id as string },
      include: { media: true, attachments: true },
    });
    expect(row.media).toHaveLength(1);
    expect(row.attachments[0].file_name).toBe('Checklist.pdf');
  });

  it('a reel cover can be an own clean gallery image (owner 2026-10-15)', async () => {
    const att = await attorney();
    const other = await attorney();
    const upload = (body: Record<string, unknown>) =>
      api().post('/api/v1/videos/uploads').set(att.auth).send(body);
    const mine = await file(att.id, 'post_image', { mime: 'image/jpeg' });
    const ok = await upload({
      sizeBytes: 1000,
      durationSec: 60,
      coverFileId: mine,
    });
    expect(ok.status).toBe(201);
    const row = await prisma.videoAsset.findUniqueOrThrow({
      where: { id: ok.body.data.videoAssetId as string },
    });
    expect(row.cover_file_id).toBe(mine);
    // Someone else's image, a document and an unscanned image are refused.
    const foreign = await file(other.id, 'post_image', { mime: 'image/jpeg' });
    const doc = await file(att.id, 'post_attachment');
    const unscanned = await file(att.id, 'post_image', {
      mime: 'image/jpeg',
      scan: 'pending',
    });
    for (const id of [foreign, doc, unscanned]) {
      const r = await upload({
        sizeBytes: 1000,
        durationSec: 60,
        coverFileId: id,
      });
      expect(r.status).toBe(422);
    }
  });

  it('text limits: 2200 with files, 3000 for a text-only brief (owner 2026-10-15)', async () => {
    const att = await attorney();
    const photo = await file(att.id, 'post_image', { mime: 'image/jpeg' });
    const withPhoto = await post(att.auth, {
      body: 'x'.repeat(2201),
      mediaFileIds: [photo],
    });
    expect(withPhoto.status).toBe(400);
    const brief = await post(att.auth, { body: 'y'.repeat(3000) });
    expect(brief.status).toBe(201);
    const tooLong = await post(att.auth, { body: 'y'.repeat(3001) });
    expect(tooLong.status).toBe(400);
  });

  it('a post without a topic is published as general content (owner 2026-10-15)', async () => {
    const att = await attorney();
    const r = await post(att.auth, {
      body: 'Just a thought.',
      practiceCode: undefined,
    });
    expect(r.status).toBe(201);
    expect(r.body.data.practice).toBeNull();
    const row = await prisma.post.findUniqueOrThrow({
      where: { id: r.body.data.id as string },
    });
    expect(row.practice_area_id).toBeNull();
  });
});
