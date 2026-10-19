import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { ensurePostPractices } from './support/post-practices';

/**
 * Owner 2026-10-18: the title and the description are both optional. A
 * post with only photos (or a video, or files) and no text is published,
 * like Instagram / TikTok; a post with nothing at all is refused, on
 * create and on edit.
 */
jest.setTimeout(60_000);

describe('Media-only posts (e2e, owner 2026-10-18)', () => {
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
    await ensurePostPractices(prisma);
    tokens = app.get(TokenService);
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(baseUrl);

  async function attorney() {
    const u = await prisma.user.create({ data: { role: 'attorney' } });
    const username = `att_${u.id.slice(0, 8)}`;
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

  async function photo(ownerId: string) {
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
        scan_status: 'clean',
        width: 800,
        height: 600,
      },
    });
    return id;
  }

  const create = (
    auth: Record<string, string>,
    body: Record<string, unknown>,
  ) =>
    api()
      .post('/api/v1/posts')
      .set(auth)
      .set('Idempotency-Key', randomUUID())
      .send(body);

  const edit = (
    auth: Record<string, string>,
    id: string,
    body: Record<string, unknown>,
  ) =>
    api()
      .patch(`/api/v1/posts/${id}`)
      .set(auth)
      .set('Idempotency-Key', randomUUID())
      .send(body);

  it('publishes photos with no title and no text', async () => {
    const att = await attorney();
    const f = await photo(att.id);
    const r = await create(att.auth, {
      title: '',
      body: '',
      mediaFileIds: [f],
    });
    expect(r.status).toBe(201);
    expect(r.body.data.title).toBe(''); // '' = no title chosen
    expect(r.body.data.body).toBe('');
    expect(r.body.data.media).toHaveLength(1);
    expect(r.body.data.status).toBe('published');
  });

  it('a text-only description without a title is fine', async () => {
    const att = await attorney();
    const r = await create(att.auth, {
      title: '',
      body: 'Only a description\nwith two lines',
    });
    expect(r.status).toBe(201);
    expect(r.body.data.title).toBe(''); // '' = no title chosen
    expect(r.body.data.body).toBe('Only a description\nwith two lines');
  });

  it('refuses a post with nothing at all', async () => {
    const att = await attorney();
    const r = await create(att.auth, { title: '  ', body: '  ' });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('an edit may clear the text of a photo post, not of a text post', async () => {
    const att = await attorney();
    const f = await photo(att.id);
    const withPhoto = await create(att.auth, {
      title: 'Court day',
      body: 'Notes',
      mediaFileIds: [f],
    });
    expect(withPhoto.status).toBe(201);
    const cleared = await edit(att.auth, withPhoto.body.data.id as string, {
      title: '',
      body: '',
    });
    expect(cleared.status).toBe(200);
    expect(cleared.body.data.title).toBe('');
    expect(cleared.body.data.body).toBe('');

    const textOnly = await create(att.auth, { title: 'Tip', body: 'Read it' });
    expect(textOnly.status).toBe(201);
    const empty = await edit(att.auth, textOnly.body.data.id as string, {
      title: '',
      body: '',
    });
    expect(empty.status).toBe(400);
    expect(empty.body.error.code).toBe('VALIDATION_ERROR');
  });
});
