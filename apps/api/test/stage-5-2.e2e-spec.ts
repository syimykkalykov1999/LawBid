import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * docs/05 §16 stage 5.2 acceptance: a client and an unverified attorney
 * can't post (POST_NOT_ALLOWED); the 11th hashtag is ignored; a file whose
 * scan isn't clean can't be attached; a deleted post leaves every listing.
 */
jest.setTimeout(60_000);

describe('Posts (e2e, docs/05 §3, stage 5.2)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let baseUrl = '';

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
    baseUrl = `http://127.0.0.1:${((app.getHttpServer() as Server).address() as AddressInfo).port}`;
    prisma = app.get(PrismaService);
    tokens = app.get(TokenService);
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(baseUrl);

  async function user(role: 'client' | 'attorney', verified = true) {
    const u = await prisma.user.create({ data: { role } });
    if (role === 'attorney') {
      const username = `att_${u.id.slice(0, 8)}`;
      await prisma.attorneyProfile.create({
        data: {
          user_id: u.id,
          username,
          username_lower: username,
          languages: ['en'],
          verification_status: verified ? 'verified' : 'unverified',
        },
      });
    }
    const token = tokens.signAccessToken({
      sub: u.id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney' && verified,
      subscriptionStatus: 'none',
    });
    return { id: u.id, auth: { Authorization: `Bearer ${token}` } };
  }

  async function file(ownerId: string, scan: 'clean' | 'pending') {
    const id = randomUUID();
    await prisma.file.create({
      data: {
        id,
        owner_user_id: ownerId,
        purpose: 'post_image',
        s3_bucket: 'lawbid-media',
        s3_key: `posts/${id}`,
        mime: 'image/jpeg',
        size_bytes: BigInt(1000),
        sha256: 'a'.repeat(64),
        scan_status: scan,
        width: 800,
        height: 600,
      },
    });
    return id;
  }

  const post = (auth: Record<string, string>, body: Record<string, unknown>) =>
    api()
      .post('/api/v1/posts')
      .set(auth)
      .set('Idempotency-Key', randomUUID())
      .send(body);

  it('only a verified attorney can post', async () => {
    const client = await user('client');
    const unverified = await user('attorney', false);
    for (const u of [client, unverified]) {
      const r = await post(u.auth, { body: 'Know your rights' });
      expect(r.status).toBe(403);
      expect(r.body.error.code).toBe('POST_NOT_ALLOWED');
    }
  });

  it('hashtags: 10 kept, the 11th ignored; photos in order; edit marks "Изменено"', async () => {
    const att = await user('attorney');
    const f1 = await file(att.id, 'clean');
    const f2 = await file(att.id, 'clean');
    const tags = Array.from({ length: 11 }, (_, i) => `#t${i}`).join(' ');
    const r = await post(att.auth, {
      body: `Traffic stop tips ${tags}`,
      mediaFileIds: [f2, f1],
    });
    expect(r.status).toBe(201);
    expect(r.body.data.tags).toHaveLength(10);
    expect(r.body.data.tags).not.toContain('t10');
    const media = r.body.data.media as { fileId: string }[];
    expect(media.map((m) => m.fileId)).toEqual([f2, f1]);
    expect(r.body.data.editedAt).toBeNull();
    const id = r.body.data.id as string;

    const e = await api()
      .patch(`/api/v1/posts/${id}`)
      .set(att.auth)
      .send({ body: 'Updated #new' });
    expect(e.status).toBe(200);
    expect(e.body.data.tags).toEqual(['new']);
    expect(e.body.data.editedAt).toEqual(expect.any(String));

    // Someone else can't edit it.
    const other = await user('attorney');
    expect(
      (
        await api()
          .patch(`/api/v1/posts/${id}`)
          .set(other.auth)
          .send({ body: 'x' })
      ).status,
    ).toBe(404);
  });

  it('a file whose scan is not clean cannot be attached', async () => {
    const att = await user('attorney');
    const pending = await file(att.id, 'pending');
    const r = await post(att.auth, {
      body: 'Photo post',
      mediaFileIds: [pending],
    });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('FILE_NOT_ATTACHABLE');
  });

  it('a deleted post disappears from the post and the profile listing', async () => {
    const att = await user('attorney');
    const reader = await user('client');
    const r = await post(att.auth, { body: 'Will be deleted' });
    const id = r.body.data.id as string;
    const list = async () =>
      (await api().get(`/api/v1/attorneys/${att.id}/posts`).set(reader.auth))
        .body.data as { id: string }[];
    expect((await list()).map((p) => p.id)).toContain(id);
    expect(
      (await api().delete(`/api/v1/posts/${id}`).set(att.auth)).status,
    ).toBe(200);
    expect(
      (await api().get(`/api/v1/posts/${id}`).set(reader.auth)).status,
    ).toBe(404);
    expect((await list()).map((p) => p.id)).not.toContain(id);
  });

  it('video uploads are refused while video_posts is off', async () => {
    const att = await user('attorney');
    const r = await api()
      .post('/api/v1/files/presign')
      .set(att.auth)
      .send({
        purpose: 'post_video',
        mime: 'image/jpeg',
        sizeBytes: 1000,
        sha256: 'a'.repeat(64),
      });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('FEATURE_DISABLED');
  });
});
