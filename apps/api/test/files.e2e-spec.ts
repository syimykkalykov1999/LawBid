import type { AddressInfo, Server } from 'node:net';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { LoggerErrorInterceptor, Logger } from 'nestjs-pino';
import request from 'supertest';
import sharp from 'sharp';
import type Redis from 'ioredis';
import { AppModule } from '../src/app.module';
import { FeatureFlagsService } from '../src/modules/feature-flags/services/feature-flags.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { FilesService } from '../src/modules/files/files.service';
import { S3StorageService } from '../src/modules/files/storage/s3-storage.service';
import { EICAR_SIGNATURE } from '../src/modules/files/scanning/virus-scanner';
import { variantKey } from '../src/modules/files/files.policy';

/**
 * docs/03_VERIFICATION_PROFILES.md §11 stage 3.2 acceptance, against the
 * local MinIO (docker-compose.yml) and the in-process `files` worker:
 * wrong type / oversize rejected, infected files can't be attached,
 * unsigned access to a key is denied, signed links expire. Plus the
 * avatar pipeline (HEIC → JPEG, square crop, EXIF stripped) and
 * PATCH /users/me avatarFileId.
 */
jest.setTimeout(60_000);

type Json = Record<string, unknown>;
interface FileView {
  id: string;
  purpose: string;
  mime: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  scanStatus: string;
  url: string | null;
}

describe('Files (e2e) — presign, confirm, scan, signed links', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storage: S3StorageService;
  let baseUrl = '';
  let phoneSeq = 0;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useLogger(app.get(Logger));
    app.useGlobalInterceptors(new LoggerErrorInterceptor());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.setGlobalPrefix('api/v1', {
      exclude: ['/health/live', '/health/ready', '/docs', '/docs-json'],
    });
    await app.listen(0, '127.0.0.1');
    const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
    prisma = app.get(PrismaService);
    storage = app.get(S3StorageService);
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(baseUrl);
  const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function login(): Promise<Record<string, string>> {
    phoneSeq += 1;
    const phone = `+1202555${String(6300 + phoneSeq).padStart(4, '0')}`;
    await api()
      .post('/api/v1/auth/otp/request')
      .send({ channel: 'phone', identifier: phone })
      .expect(200);
    const res = await api()
      .post('/api/v1/auth/otp/verify')
      .send({
        channel: 'phone',
        identifier: phone,
        code: '000000',
        deviceInfo: { deviceId: 'files-e2e' },
      })
      .expect(201);
    const token = (res.body as { data: { accessToken: string } }).data
      .accessToken;
    return { Authorization: `Bearer ${token}` };
  }

  async function presign(
    auth: Record<string, string>,
    body: {
      purpose: string;
      mime: string;
      sizeBytes: number;
      sha256: string;
      acceptsExisting?: boolean;
    },
    expectStatus = 201,
  ): Promise<Json> {
    const res = await api()
      .post('/api/v1/files/presign')
      .set(auth)
      .send(body)
      .expect(expectStatus);
    return res.body as Json;
  }

  /** Browser-style multipart POST straight to MinIO. */
  async function uploadTo(
    upload: { url: string; fields: Record<string, string> },
    data: Buffer,
    contentType: string,
  ): Promise<number> {
    const form = new FormData();
    for (const [k, v] of Object.entries(upload.fields)) form.append(k, v);
    form.append(
      'file',
      new Blob([new Uint8Array(data)], { type: contentType }),
    );
    const res = await fetch(upload.url, { method: 'POST', body: form });
    return res.status;
  }

  /** presign + upload; returns the file id. */
  async function uploaded(
    auth: Record<string, string>,
    purpose: string,
    mime: string,
    data: Buffer,
  ): Promise<{ fileId: string; key: string; bucket: string }> {
    const body = await presign(auth, {
      purpose,
      mime,
      sizeBytes: data.length,
      sha256: sha(data),
    });
    const p = body.data as {
      fileId: string;
      upload: { url: string; fields: Record<string, string> };
    };
    expect(await uploadTo(p.upload, data, mime)).toBe(204);
    return {
      fileId: p.fileId,
      key: p.upload.fields.key,
      bucket: new URL(p.upload.url).pathname.replace(/^\//, '').split('/')[0],
    };
  }

  async function confirm(
    auth: Record<string, string>,
    id: string,
    status = 200,
  ): Promise<Json> {
    const res = await api()
      .post(`/api/v1/files/${id}/confirm`)
      .set(auth)
      .expect(status);
    return res.body as Json;
  }

  async function settled(
    auth: Record<string, string>,
    id: string,
  ): Promise<FileView> {
    for (let i = 0; i < 100; i += 1) {
      const res = await api().get(`/api/v1/files/${id}`).set(auth).expect(200);
      const f = (res.body as { data: FileView }).data;
      if (f.scanStatus !== 'pending') return f;
      await sleep(200);
    }
    throw new Error('scan did not finish');
  }

  const errorCode = (body: Json) => (body.error as { code: string }).code;

  const jpeg = (w: number, h: number) =>
    sharp({
      create: { width: w, height: h, channels: 3, background: '#1b2a4a' },
    })
      .jpeg()
      .withMetadata({
        orientation: 1,
        exif: { IFD0: { Artist: 'gps-leak-marker' } },
      })
      .toBuffer();
  const png = () =>
    sharp({
      create: { width: 10, height: 10, channels: 3, background: '#c8a24a' },
    })
      .png()
      .toBuffer();

  describe('wrong type / size is rejected', () => {
    it('a PNG declared as PDF is rejected by magic bytes and its object deleted', async () => {
      const auth = await login();
      const data = await png();
      const f = await uploaded(
        auth,
        'verification_document',
        'application/pdf',
        data,
      );
      const body = await confirm(auth, f.fileId, 400);
      expect(errorCode(body)).toBe('FILE_TYPE_NOT_ALLOWED');
      expect((body.error as { details: Json }).details).toMatchObject({
        declared: 'application/pdf',
        detected: 'image/png',
      });
      expect(await storage.head(f.bucket, f.key)).toBeNull();
      expect(await prisma.file.count({ where: { id: f.fileId } })).toBe(0);
      // The intent is gone: a retry cannot resurrect it.
      expect(errorCode(await confirm(auth, f.fileId, 404))).toBe('NOT_FOUND');
    });

    it('declared types outside the purpose allow-list are refused at presign', async () => {
      const auth = await login();
      const body = await presign(
        auth,
        {
          purpose: 'avatar',
          mime: 'application/pdf',
          sizeBytes: 100,
          sha256: sha(Buffer.from('x')),
        },
        400,
      );
      expect(errorCode(body)).toBe('FILE_TYPE_NOT_ALLOWED');
      const selfie = await presign(
        auth,
        {
          purpose: 'verification_selfie',
          mime: 'application/pdf',
          sizeBytes: 100,
          sha256: sha(Buffer.from('x')),
        },
        400,
      );
      expect(errorCode(selfie)).toBe('FILE_TYPE_NOT_ALLOWED');
      const bad = await presign(
        auth,
        {
          purpose: 'avatar',
          mime: 'image/bmp',
          sizeBytes: 100,
          sha256: sha(Buffer.from('x')),
        },
        400,
      );
      expect(errorCode(bad)).toBe('VALIDATION_ERROR');
    });

    it('oversize: avatar > 5 MB and documents > 10 MB are refused', async () => {
      const auth = await login();
      const h = sha(Buffer.from('x'));
      const avatar = await presign(
        auth,
        {
          purpose: 'avatar',
          mime: 'image/jpeg',
          sizeBytes: 5 * 1024 * 1024 + 1,
          sha256: h,
        },
        400,
      );
      expect(errorCode(avatar)).toBe('FILE_TOO_LARGE');
      const doc = await presign(
        auth,
        {
          purpose: 'verification_document',
          mime: 'application/pdf',
          sizeBytes: 10 * 1024 * 1024 + 1,
          sha256: h,
        },
        400,
      );
      expect(errorCode(doc)).toBe('FILE_TOO_LARGE');
      // Exactly at the limit is fine.
      await presign(auth, {
        purpose: 'avatar',
        mime: 'image/jpeg',
        sizeBytes: 5 * 1024 * 1024,
        sha256: h,
      });
    });

    it('S3 refuses an upload larger than declared or with another Content-Type', async () => {
      const auth = await login();
      const data = await jpeg(20, 20);
      const body = await presign(auth, {
        purpose: 'post_image',
        mime: 'image/jpeg',
        sizeBytes: data.length,
        sha256: sha(data),
      });
      const p = body.data as {
        fileId: string;
        upload: { url: string; fields: Record<string, string> };
      };
      expect(
        await uploadTo(
          p.upload,
          Buffer.concat([data, Buffer.alloc(10)]),
          'image/jpeg',
        ),
      ).toBe(400);
      const typed = new FormData();
      for (const [k, v] of Object.entries(p.upload.fields)) {
        typed.append(k, k === 'Content-Type' ? 'text/html' : v);
      }
      typed.append('file', new Blob([new Uint8Array(data)]));
      expect(
        (await fetch(p.upload.url, { method: 'POST', body: typed })).status,
      ).toBe(403);
      expect(errorCode(await confirm(auth, p.fileId, 409))).toBe(
        'FILE_NOT_UPLOADED',
      );
    });

    it('a checksum that differs from the declared one is rejected', async () => {
      const auth = await login();
      const data = await jpeg(16, 16);
      const body = await presign(auth, {
        purpose: 'post_image',
        mime: 'image/jpeg',
        sizeBytes: data.length,
        sha256: sha(Buffer.from('something else')),
      });
      const p = body.data as {
        fileId: string;
        upload: { url: string; fields: Record<string, string> };
      };
      expect(await uploadTo(p.upload, data, 'image/jpeg')).toBe(204);
      expect(errorCode(await confirm(auth, p.fileId, 400))).toBe(
        'FILE_CHECKSUM_MISMATCH',
      );
      expect(
        await storage.head(p.upload.url.split('/').pop()!, p.upload.fields.key),
      ).toBeNull();
    });
  });

  describe('post photos in every common format', () => {
    // Owner 2026-10-16: a Mac screenshot (PNG) must go through like a JPEG.
    const shot = (w: number, h: number) =>
      sharp({
        // A Mac screenshot: RGBA, Display P3 profile.
        create: {
          width: w,
          height: h,
          channels: 4,
          background: { r: 233, g: 238, b: 245, alpha: 1 },
        },
      })
        .composite([
          {
            input: Buffer.from(
              `<svg width="${w}" height="${h}"><rect x="40" y="40" width="${w - 80}" height="120" fill="#1b2a4a"/><text x="60" y="110" font-size="48" fill="#fff">Screenshot</text></svg>`,
            ),
          },
        ])
        .withMetadata({ icc: 'p3' })
        .png()
        .toBuffer();

    it('a retina-size PNG screenshot becomes a clean post photo', async () => {
      const auth = await login();
      const data = await shot(2880, 1800);
      const f = await uploaded(auth, 'post_image', 'image/png', data);
      await confirm(auth, f.fileId);
      const done = await settled(auth, f.fileId);
      expect(done.scanStatus).toBe('clean');
    });

    it.each([
      [
        'image/webp',
        () =>
          sharp({
            create: {
              width: 64,
              height: 64,
              channels: 3,
              background: '#c8a24a',
            },
          })
            .webp()
            .toBuffer(),
      ],
    ])('%s is a clean post photo', async (mime, make) => {
      const auth = await login();
      const f = await uploaded(auth, 'post_image', mime, await make());
      await confirm(auth, f.fileId);
      expect((await settled(auth, f.fileId)).scanStatus).toBe('clean');
    });
  });

  describe('antivirus', () => {
    it('an EICAR document becomes infected, its object is deleted and it cannot be attached', async () => {
      const auth = await login();
      const data = Buffer.from(
        `%PDF-1.4\n${EICAR_SIGNATURE}\n%%EOF\n`,
        'latin1',
      );
      const f = await uploaded(
        auth,
        'verification_document',
        'application/pdf',
        data,
      );
      const confirmed = (await confirm(auth, f.fileId)).data as FileView;
      expect(confirmed.scanStatus).toBe('pending');
      const done = await settled(auth, f.fileId);
      expect(done.scanStatus).toBe('infected');
      expect(await storage.head(f.bucket, f.key)).toBeNull();
      const row = await prisma.file.findUniqueOrThrow({
        where: { id: f.fileId },
      });
      await expect(
        app
          .get(FilesService)
          .assertAttachable(row.owner_user_id, f.fileId, [
            'verification_document',
          ]),
      ).rejects.toMatchObject({ response: { code: 'FILE_NOT_ATTACHABLE' } });
    });

    it('an infected avatar cannot be set on the profile', async () => {
      const auth = await login();
      const data = Buffer.concat([
        await jpeg(32, 32),
        Buffer.from(EICAR_SIGNATURE, 'latin1'),
      ]);
      const f = await uploaded(auth, 'avatar', 'image/jpeg', data);
      await confirm(auth, f.fileId);
      expect((await settled(auth, f.fileId)).scanStatus).toBe('infected');
      const res = await api()
        .patch('/api/v1/users/me')
        .set(auth)
        .send({ avatarFileId: f.fileId })
        .expect(409);
      expect(errorCode(res.body as Json)).toBe('FILE_NOT_ATTACHABLE');
      const me = await api().get('/api/v1/users/me').set(auth).expect(200);
      expect((me.body as { data: Json }).data.avatarFileId).toBeNull();
    });
  });

  describe('avatar pipeline + PATCH /users/me', () => {
    it('clean JPEG avatar: square 1024, EXIF stripped, variant stored, set and served via signed link', async () => {
      const auth = await login();
      const data = await jpeg(2000, 1200);
      const f = await uploaded(auth, 'avatar', 'image/jpeg', data);
      await confirm(auth, f.fileId);
      // Idempotent confirm.
      expect(((await confirm(auth, f.fileId)).data as FileView).id).toBe(
        f.fileId,
      );
      const done = await settled(auth, f.fileId);
      expect(done).toMatchObject({
        scanStatus: 'clean',
        // storage.image_format (default webp, owner 2026-10-05).
        mime: 'image/webp',
        width: 1024,
        height: 1024,
      });
      expect(done.url).toMatch(/X-Amz-Signature=/);

      // M3 (2026-11-08): the file lives at the row's key, a copy of the
      // upload no presigned link can write.
      const { s3_key: key } = await prisma.file.findUniqueOrThrow({
        where: { id: f.fileId },
      });
      expect(key).not.toBe(f.key);
      const stored = await storage.read(f.bucket, key);
      expect(stored.includes('gps-leak-marker')).toBe(false);
      expect((await sharp(stored).metadata()).exif).toBeUndefined();
      expect(done.sizeBytes).toBe(stored.length);
      const variant = await sharp(
        await storage.read(f.bucket, variantKey(key, 256)),
      ).metadata();
      expect([variant.width, variant.height]).toEqual([256, 256]);

      const res = await api()
        .patch('/api/v1/users/me')
        .set(auth)
        .send({ avatarFileId: f.fileId })
        .expect(200);
      const me = (
        res.body as { data: { avatarFileId: string; avatarUrl: string } }
      ).data;
      expect(me.avatarFileId).toBe(f.fileId);
      const img = await fetch(me.avatarUrl);
      expect(img.status).toBe(200);
      expect(img.headers.get('content-type')).toBe('image/webp');

      await api()
        .patch('/api/v1/users/me')
        .set(auth)
        .send({ avatarFileId: null })
        .expect(200);
      const cleared = await api().get('/api/v1/users/me').set(auth).expect(200);
      expect((cleared.body as { data: Json }).data).toMatchObject({
        avatarFileId: null,
        avatarUrl: null,
      });
    });

    it('GET /attorneys/:username serves the photo (main + 256 px), never a verification file', async () => {
      await prisma.state.upsert({
        where: { code: 'NY' },
        create: { code: 'NY', name: 'New York', is_active: true },
        update: {},
      });
      const auth = await login();
      await api()
        .post('/api/v1/users/me/consents')
        .set(auth)
        .send({
          consents: ['age_18', 'terms', 'privacy', 'disclaimer'].map(
            (type) => ({ type, granted: true }),
          ),
        })
        .expect(201);
      // Phones repeat across runs of this suite: on a re-run the user
      // already is an attorney (ROLE_ALREADY_SET), which is fine here.
      const roleRes = await api()
        .post('/api/v1/users/me/role')
        .set(auth)
        .send({ role: 'attorney' });
      expect([200, 409]).toContain(roleRes.status);
      const meRes = await api().get('/api/v1/users/me').set(auth).expect(200);
      const me = (meRes.body as { data: { id: string; role: string } }).data;
      expect(me.role).toBe('attorney');
      const userId = me.id;
      const saved = await api()
        .patch('/api/v1/users/me/onboarding')
        .set(auth)
        .send({
          currentStep: 'push',
          profile: {
            firstName: 'Photo',
            lastName: 'Public',
            licensedStates: ['NY'],
          },
        })
        .expect(200);
      const username = (
        saved.body as { data: { profile: { username: string } } }
      ).data.profile.username;
      const publicProfile = async () =>
        (
          (
            await api()
              .get(`/api/v1/attorneys/${username}`)
              .set(auth)
              .expect(200)
          ).body as {
            data: { avatarUrl: string | null; avatarUrl256: string | null };
          }
        ).data;

      expect(await publicProfile()).toMatchObject({
        avatarUrl: null,
        avatarUrl256: null,
      });

      const f = await uploaded(
        auth,
        'avatar',
        'image/jpeg',
        await jpeg(900, 700),
      );
      await confirm(auth, f.fileId);
      expect((await settled(auth, f.fileId)).scanStatus).toBe('clean');
      await api()
        .patch('/api/v1/users/me')
        .set(auth)
        .send({ avatarFileId: f.fileId })
        .expect(200);
      const view = await publicProfile();
      const main = await fetch(view.avatarUrl!);
      expect(main.status).toBe(200);
      expect(main.headers.get('content-type')).toBe('image/webp');
      const small = await fetch(view.avatarUrl256!);
      expect(small.status).toBe(200);
      const meta = await sharp(
        Buffer.from(await small.arrayBuffer()),
      ).metadata();
      expect([meta.width, meta.height]).toEqual([256, 256]);

      // Even if avatar_file_id pointed at a verification selfie, the public
      // profile would not sign it.
      const selfie = await uploaded(
        auth,
        'verification_selfie',
        'image/jpeg',
        await jpeg(64, 64),
      );
      await confirm(auth, selfie.fileId);
      await settled(auth, selfie.fileId);
      await prisma.user.update({
        where: { id: userId },
        data: { avatar_file_id: selfie.fileId },
      });
      expect(await publicProfile()).toMatchObject({
        avatarUrl: null,
        avatarUrl256: null,
      });
    });

    it('HEIC is converted to JPEG; a selfie is not usable as an avatar', async () => {
      const auth = await login();
      const heic = readFileSync(join(__dirname, 'fixtures/sample.heic'));
      const f = await uploaded(auth, 'verification_selfie', 'image/heic', heic);
      await confirm(auth, f.fileId);
      const done = await settled(auth, f.fileId);
      expect(done).toMatchObject({
        scanStatus: 'clean',
        mime: 'image/jpeg',
        width: 64,
        height: 48,
      });
      expect(done.url).toBeNull(); // verification files are never served to the app
      const { s3_key: key } = await prisma.file.findUniqueOrThrow({
        where: { id: f.fileId },
      });
      expect((await storage.read(f.bucket, key)).subarray(0, 3)).toEqual(
        Buffer.from([0xff, 0xd8, 0xff]),
      );
      const res = await api()
        .patch('/api/v1/users/me')
        .set(auth)
        .send({ avatarFileId: f.fileId })
        .expect(409);
      expect(errorCode(res.body as Json)).toBe('FILE_NOT_ATTACHABLE');
    });

    it("another user's file is invisible and not attachable", async () => {
      const owner = await login();
      const other = await login();
      const f = await uploaded(owner, 'avatar', 'image/png', await png());
      expect(errorCode(await confirm(other, f.fileId, 404))).toBe('NOT_FOUND');
      await confirm(owner, f.fileId);
      await settled(owner, f.fileId);
      await api().get(`/api/v1/files/${f.fileId}`).set(other).expect(404);
      await api()
        .patch('/api/v1/users/me')
        .set(other)
        .send({ avatarFileId: f.fileId })
        .expect(404);
    });
  });

  /**
   * D-c1 (2026-11-09, security audit M3 + OWASP File Upload Cheat Sheet):
   * the presigned link writes only under `staging/`; confirm copies the
   * checked bytes to the row's own key outside it. Fail-first: a write to
   * the final key is refused by the store, and bytes swapped in through the
   * still-valid link after the scan never reach the row's object.
   */
  describe('upload staging (D-c1)', () => {
    it('the link writes under staging/, the row points outside it, a PUT to the final key is refused', async () => {
      const auth = await login();
      const data = Buffer.from('%PDF-1.4\nstaged\n');
      const body = await presign(auth, {
        purpose: 'verification_document',
        mime: 'application/pdf',
        sizeBytes: data.length,
        sha256: sha(data),
      });
      const p = body.data as {
        fileId: string;
        upload: { url: string; fields: Record<string, string> };
      };
      expect(p.upload.fields.key.startsWith('staging/')).toBe(true);
      expect(await uploadTo(p.upload, data, 'application/pdf')).toBe(204);
      await confirm(auth, p.fileId);
      expect((await settled(auth, p.fileId)).scanStatus).toBe('clean');
      const row = await prisma.file.findUniqueOrThrow({
        where: { id: p.fileId },
      });
      expect(row.s3_key.startsWith('staging/')).toBe(false);
      expect(row.s3_key).not.toBe(p.upload.fields.key);

      // The signed form is bound to the staging key: the same form aimed
      // at the row's key (or at any key outside staging/) is refused.
      const aimed = {
        url: p.upload.url,
        fields: { ...p.upload.fields, key: row.s3_key },
      };
      expect(await uploadTo(aimed, data, 'application/pdf')).toBe(403);
      // And an unsigned PUT to the final key is refused outright.
      const endpoint = process.env.S3_ENDPOINT!;
      const put = await fetch(`${endpoint}/${row.s3_bucket}/${row.s3_key}`, {
        method: 'PUT',
        body: new Uint8Array(Buffer.from('%PDF-1.4\nswapped\n')),
        headers: { 'Content-Type': 'application/pdf' },
      });
      expect(put.status).toBe(403);
    });

    it('bytes swapped in through the still-valid link after the scan are not what the row serves', async () => {
      const auth = await login();
      const original = Buffer.from('%PDF-1.4\noriginal-bytes\n');
      const body = await presign(auth, {
        purpose: 'verification_document',
        mime: 'application/pdf',
        sizeBytes: original.length,
        sha256: sha(original),
      });
      const p = body.data as {
        fileId: string;
        upload: { url: string; fields: Record<string, string> };
      };
      expect(await uploadTo(p.upload, original, 'application/pdf')).toBe(204);
      await confirm(auth, p.fileId);
      expect((await settled(auth, p.fileId)).scanStatus).toBe('clean');

      // The attacker's link is still valid (5 min): the same size, other
      // bytes (the form fixes only the length and the type).
      const swapped = Buffer.from('%PDF-1.4\nswapped!-bytes\n');
      expect(swapped.length).toBe(original.length);
      expect(await uploadTo(p.upload, swapped, 'application/pdf')).toBe(204);

      const row = await prisma.file.findUniqueOrThrow({
        where: { id: p.fileId },
      });
      // What every download signs and reads is the row's key: the original.
      const served = await storage.read(row.s3_bucket, row.s3_key);
      expect(sha(served)).toBe(sha(original));
      expect(row.sha256).toBe(sha(original));
      const { url } = await app.get(FilesService).verificationFileUrl(p.fileId);
      expect(new URL(url).pathname.includes('/staging/')).toBe(false);
      const viaLink = Buffer.from(await (await fetch(url)).arrayBuffer());
      expect(sha(viaLink)).toBe(sha(original));
    });
  });

  describe('private storage + signed links', () => {
    it('an unsigned GET of the object key is denied by MinIO (both buckets)', async () => {
      const auth = await login();
      const doc = await uploaded(
        auth,
        'verification_document',
        'application/pdf',
        Buffer.from('%PDF-1.4\nclean\n'),
      );
      await confirm(auth, doc.fileId);
      expect((await settled(auth, doc.fileId)).scanStatus).toBe('clean');
      const avatar = await uploaded(auth, 'avatar', 'image/png', await png());
      await confirm(auth, avatar.fileId);
      await settled(auth, avatar.fileId);
      const endpoint = process.env.S3_ENDPOINT!;
      for (const u of [doc, avatar]) {
        // The row's key: identical bytes uploaded earlier share one object.
        const row = await prisma.file.findUniqueOrThrow({
          where: { id: u.fileId },
        });
        const f = { bucket: row.s3_bucket, key: row.s3_key };
        expect(await storage.head(f.bucket, f.key)).not.toBeNull();
        const res = await fetch(`${endpoint}/${f.bucket}/${f.key}`);
        expect(res.status).toBe(403);
        const listing = await fetch(`${endpoint}/${f.bucket}/`);
        expect(listing.status).toBe(403);
      }
    });

    it('a signed document link works, then expires after verification.signed_url_ttl_sec', async () => {
      const auth = await login();
      const doc = await uploaded(
        auth,
        'verification_document',
        'application/pdf',
        Buffer.from('%PDF-1.4\nttl\n'),
      );
      await confirm(auth, doc.fileId);
      await settled(auth, doc.fileId);
      await prisma.appConfig.upsert({
        where: { key: 'verification.signed_url_ttl_sec' },
        create: { key: 'verification.signed_url_ttl_sec', value: 2 },
        update: { value: 2 },
      });
      await app.get<Redis>(REDIS_CLIENT).del('config:app_config');
      try {
        const { url, expiresAt } = await app
          .get(FilesService)
          .verificationFileUrl(doc.fileId);
        expect(new URL(url).searchParams.get('X-Amz-Expires')).toBe('2');
        expect(Date.parse(expiresAt) - Date.now()).toBeLessThanOrEqual(2000);
        const ok = await fetch(url);
        expect(ok.status).toBe(200);
        expect(Buffer.from(await ok.arrayBuffer()).toString()).toContain('ttl');
        await sleep(3500);
        expect((await fetch(url)).status).toBe(403);
      } finally {
        await prisma.appConfig.update({
          where: { key: 'verification.signed_url_ttl_sec' },
          data: { value: 300 },
        });
        await app.get<Redis>(REDIS_CLIENT).del('config:app_config');
      }
    });
  });

  describe('reusing a stored file (R-254, files_reuse_own)', () => {
    const setFlag = async (enabled: boolean) => {
      await prisma.featureFlag.upsert({
        where: { key: 'files_reuse_own' },
        create: { key: 'files_reuse_own', enabled },
        update: { enabled },
      });
      await app.get(FeatureFlagsService).invalidate();
    };
    afterAll(() => setFlag(false));

    const reuseBody = (data: Buffer) => ({
      purpose: 'chat_attachment',
      mime: 'application/pdf',
      sizeBytes: data.length,
      sha256: sha(data),
      acceptsExisting: true,
    });
    const stored = async (auth: Record<string, string>, data: Buffer) => {
      const { fileId } = await uploaded(
        auth,
        'chat_attachment',
        'application/pdf',
        data,
      );
      await confirm(auth, fileId);
      expect((await settled(auth, fileId)).scanStatus).toBe('clean');
      return fileId;
    };

    it('my own file: no upload, a new clean row on the same object', async () => {
      await setFlag(true);
      const me = await login();
      const data = Buffer.from(`%PDF-1.7 reuse ${Date.now()} mine`);
      const first = await stored(me, data);
      const body = await presign(me, reuseBody(data));
      const out = body.data as {
        fileId: string;
        existing?: boolean;
        upload: { url: string };
      };
      expect(out.existing).toBe(true);
      expect(out.upload.url).toBe('');
      expect(out.fileId).not.toBe(first);
      expect((await settled(me, out.fileId)).scanStatus).toBe('clean');
      const [a, b] = await Promise.all(
        [first, out.fileId].map((id) =>
          prisma.file.findUniqueOrThrow({ where: { id } }),
        ),
      );
      expect(b.s3_key).toBe(a.s3_key);
      expect(b.owner_user_id).toBe(a.owner_user_id);
    });

    it('SECURITY: someone else holding the hash gets an ordinary upload', async () => {
      await setFlag(true);
      const victim = await login();
      const thief = await login();
      const data = Buffer.from(`%PDF-1.7 reuse ${Date.now()} secret`);
      const theirs = await stored(victim, data);
      const before = await prisma.file.count({
        where: { source_sha256: sha(data) },
      });
      const out = (await presign(thief, reuseBody(data))).data as {
        fileId: string;
        existing?: boolean;
        upload: { url: string };
      };
      expect(out.existing).toBeUndefined();
      expect(out.upload.url).not.toBe('');
      expect(out.fileId).not.toBe(theirs);
      expect(
        await prisma.file.count({ where: { source_sha256: sha(data) } }),
      ).toBe(before);
      // The victim's file itself stays closed to them.
      await api().get(`/api/v1/files/${theirs}`).set(thief).expect(404);
    });

    it('flag off: an ordinary upload, even for my own file', async () => {
      await setFlag(true);
      const me = await login();
      const data = Buffer.from(`%PDF-1.7 reuse ${Date.now()} off`);
      await stored(me, data);
      await setFlag(false);
      const out = (await presign(me, reuseBody(data))).data as {
        existing?: boolean;
      };
      expect(out.existing).toBeUndefined();
    });
  });

  describe('confirm without reading a big file (R-252, files_confirm_light)', () => {
    const setFlag = async (enabled: boolean) => {
      await prisma.featureFlag.upsert({
        where: { key: 'files_confirm_light' },
        create: { key: 'files_confirm_light', enabled },
        update: { enabled },
      });
      await app.get(FeatureFlagsService).invalidate();
    };
    beforeAll(() => setFlag(true));
    afterAll(() => setFlag(false));

    const bigPdf = (fill: string, tail = '') =>
      Buffer.concat([
        Buffer.from(`%PDF-1.7 ${fill} `),
        Buffer.alloc(9 * 1024 * 1024, 0x20),
        Buffer.from(tail),
      ]);
    const send = async (
      auth: Record<string, string>,
      data: Buffer,
      claimed: string,
    ) => {
      const body = await presign(auth, {
        purpose: 'chat_attachment',
        mime: 'application/pdf',
        sizeBytes: data.length,
        sha256: claimed,
      });
      const p = body.data as {
        fileId: string;
        upload: { url: string; fields: Record<string, string> };
      };
      expect(await uploadTo(p.upload, data, 'application/pdf')).toBe(204);
      return p.fileId;
    };

    it('an honest big file ends clean, its hash proven by the worker', async () => {
      const me = await login();
      const data = bigPdf(`honest ${Date.now()}`);
      const id = await send(me, data, sha(data));
      const out = (await confirm(me, id)).data as { scanStatus: string };
      expect(out.scanStatus).toBe('pending');
      expect((await settled(me, id)).scanStatus).toBe('clean');
      const row = await prisma.file.findUniqueOrThrow({ where: { id } });
      expect(row.source_sha256).toBe(sha(data));
    });

    it('SECURITY: a false hash ends failed and never joins another file', async () => {
      const victim = await login();
      const secret = Buffer.from(`%PDF-1.7 secret ${Date.now()}`);
      const { fileId: theirs } = await uploaded(
        victim,
        'chat_attachment',
        'application/pdf',
        secret,
      );
      await confirm(victim, theirs);
      expect((await settled(victim, theirs)).scanStatus).toBe('clean');
      const victimRow = await prisma.file.findUniqueOrThrow({
        where: { id: theirs },
      });

      const thief = await login();
      const id = await send(thief, bigPdf(`liar ${Date.now()}`), sha(secret));
      await confirm(thief, id);
      expect((await settled(thief, id)).scanStatus).toBe('failed');
      const row = await prisma.file.findUniqueOrThrow({ where: { id } });
      expect(row.s3_key).not.toBe(victimRow.s3_key);
    });

    it('active content past the first bytes ends failed', async () => {
      const me = await login();
      const data = bigPdf(`active ${Date.now()}`, '/JavaScript (app.alert(1))');
      const id = await send(me, data, sha(data));
      await confirm(me, id);
      expect((await settled(me, id)).scanStatus).toBe('failed');
    });

    it('another type at the start is refused at once', async () => {
      const me = await login();
      const data = Buffer.concat([
        await png(),
        Buffer.alloc(9 * 1024 * 1024, 0),
      ]);
      const id = await send(me, data, sha(data));
      const body = await confirm(me, id, 400);
      expect(errorCode(body)).toBe('FILE_TYPE_NOT_ALLOWED');
    });
  });
});
