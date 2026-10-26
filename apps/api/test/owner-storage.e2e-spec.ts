import type { AddressInfo, Server } from 'node:net';
import { createHash, randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type Redis from 'ioredis';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { TokenService } from '../src/modules/auth/services/token.service';
import { S3StorageService } from '../src/modules/files/storage/s3-storage.service';
import { FileReleaseService } from '../src/modules/files/storage/file-release.service';
import { PENDING_UPLOADS_KEY } from '../src/modules/files/storage/pending-uploads';
import { StorageCleanupService } from '../src/modules/storage/storage-cleanup.service';
import { DataRetentionService } from '../src/modules/storage/data-retention.service';
import { StorageStatsService } from '../src/modules/storage/storage-stats.service';
import { withDeleted } from '../src/prisma/soft-delete.extension';
import { adminSession } from './support/admin-login';

/**
 * Owner 2026-10-05 (storage like Telegram): identical uploads are stored
 * once; an object goes only when no live file uses it; unused files and
 * abandoned uploads are cleaned up by themselves; per-user caps; the admin
 * «Хранилище» overview.
 */
jest.setTimeout(180_000);

describe('Storage like Telegram (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let storage: S3StorageService;
  let release: FileReleaseService;
  let cleanup: StorageCleanupService;
  let redis: Redis;
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
    storage = app.get(S3StorageService);
    release = app.get(FileReleaseService);
    cleanup = app.get(StorageCleanupService);
    redis = app.get(REDIS_CLIENT);
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

  async function user() {
    const u = await prisma.user.create({
      data: { role: 'client', first_name: 'Sam', last_name: 'Store' },
    });
    return { id: u.id, auth: bearer(u.id) };
  }

  /** A unique small PDF (or the same one when [text] repeats). */
  const pdf = (text: string) =>
    Buffer.from(`%PDF-1.7\n% ${text}\n1 0 obj << >> endobj\n%%EOF\n`);

  async function presign(
    auth: Record<string, string>,
    bytes: Buffer,
    purpose = 'chat_attachment',
  ) {
    return api()
      .post('/api/v1/files/presign')
      .set(auth)
      .send({
        purpose,
        mime: 'application/pdf',
        sizeBytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      });
  }

  async function put(
    p: { upload: { url: string; fields: Record<string, string> } },
    bytes: Buffer,
  ) {
    const form = new FormData();
    for (const [k, v] of Object.entries(p.upload.fields)) form.append(k, v);
    form.append(
      'file',
      new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
    );
    const up = await fetch(p.upload.url, { method: 'POST', body: form });
    expect(up.status).toBe(204);
  }

  /** presign → MinIO → confirm → clean; returns the file id. */
  async function upload(auth: Record<string, string>, bytes: Buffer) {
    const pre = await presign(auth, bytes);
    expect(pre.status).toBe(201);
    const p = pre.body.data;
    await put(p, bytes);
    await api().post(`/api/v1/files/${p.fileId}/confirm`).set(auth).expect(200);
    for (let i = 0; i < 100; i += 1) {
      const f = await api().get(`/api/v1/files/${p.fileId}`).set(auth);
      const status = (f.body.data as { scanStatus: string }).scanStatus;
      if (status === 'clean') return p.fileId as string;
      if (status !== 'pending') throw new Error(`scan ${status}`);
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error('scan did not finish');
  }

  /** The hourly storage.gc of this process may hold the lock right now;
   * the cleanup is idempotent, so the test takes its turn regardless. */
  const cleanupNow = async () => {
    await redis.del('lock:job:storage.gc');
    return cleanup.runNow();
  };

  const row = (id: string) =>
    prisma.file.findUniqueOrThrow({ where: withDeleted({ id }) });

  it('stores identical uploads once and removes the object only with its last user', async () => {
    const a = await user();
    const b = await user();
    const bytes = pdf(`same-${randomUUID()}`);
    const first = await upload(a.auth, bytes);
    const second = await upload(b.auth, bytes);
    const [r1, r2] = [await row(first), await row(second)];
    expect(r2.s3_key).toBe(r1.s3_key);
    expect(r2.owner_user_id).toBe(b.id);
    // B's own upload object is gone, the shared one is there.
    expect(
      await storage.head(r2.s3_bucket, `chat_attachment/${b.id}/${second}`),
    ).toBeNull();
    expect(await storage.head(r1.s3_bucket, r1.s3_key)).not.toBeNull();

    await release.release([first], 'released');
    expect(await storage.head(r1.s3_bucket, r1.s3_key)).not.toBeNull();
    expect((await row(first)).purged_at).not.toBeNull();

    await release.release([second], 'released');
    expect(await storage.head(r1.s3_bucket, r1.s3_key)).toBeNull();
  });

  it('sets unused files aside, then removes them; files in use stay', async () => {
    const a = await user();
    const unused = await upload(a.auth, pdf(`unused-${randomUUID()}`));
    const used = await upload(a.auth, pdf(`used-${randomUUID()}`));
    await prisma.attorneyTask.create({
      data: {
        attorney_id: a.id,
        kind: 'other',
        title: 'Keep this file',
        file_ids: [used],
      },
    });
    const old = new Date(Date.now() - 3 * 24 * 3600 * 1000);
    await prisma.file.updateMany({
      where: { id: { in: [unused, used] } },
      data: { created_at: old },
    });
    const r = await cleanupNow();
    expect(r.orphansFound).toBeGreaterThanOrEqual(1);
    expect((await row(unused)).deleted_reason).toBe('orphan');
    expect((await row(used)).deleted_at).toBeNull();

    // A row in a bucket that does not exist (old data, other tests) never
    // blocks the rest of the cleanup.
    await prisma.file.create({
      data: {
        owner_user_id: a.id,
        purpose: 'post_image',
        s3_bucket: `no-such-bucket-${randomUUID().slice(0, 8)}`,
        s3_key: `gone/${randomUUID()}`,
        mime: 'image/jpeg',
        size_bytes: 1n,
        sha256: 'c'.repeat(64),
        deleted_at: new Date(Date.now() - 30 * 24 * 3600 * 1000),
        deleted_reason: 'released',
      },
    });

    const key = (await row(unused)).s3_key;
    const bucket = (await row(unused)).s3_bucket;
    await prisma.file.update({
      where: { id: unused },
      data: { deleted_at: new Date(Date.now() - 8 * 24 * 3600 * 1000) },
    });
    const r2 = await cleanupNow();
    expect(r2.objectsRemoved).toBeGreaterThanOrEqual(1);
    expect(await prisma.file.findUnique({ where: { id: unused } })).toBeNull();
    expect(await storage.head(bucket, key)).toBeNull();
    expect((await row(used)).deleted_at).toBeNull();
  });

  it('removes uploads that were never confirmed', async () => {
    const a = await user();
    const bytes = pdf(`abandoned-${randomUUID()}`);
    const pre = await presign(a.auth, bytes);
    expect(pre.status).toBe(201);
    await put(pre.body.data, bytes);
    const members = await redis.zrangebyscore(
      PENDING_UPLOADS_KEY,
      '-inf',
      '+inf',
    );
    const mine = members.find((m) => m.startsWith(pre.body.data.fileId));
    expect(mine).toBeDefined();
    const [, bucket, key] = mine!.split('|');
    expect(await storage.head(bucket, key)).not.toBeNull();
    await redis.zadd(PENDING_UPLOADS_KEY, 1, mine!);
    const r = await cleanupNow();
    expect(r.pendingUploadsRemoved).toBeGreaterThanOrEqual(1);
    expect(await storage.head(bucket, key)).toBeNull();
  });

  it('refuses uploads past the personal storage cap', async () => {
    const a = await user();
    await upload(a.auth, pdf(`cap-${randomUUID()}`));
    await prisma.user.update({
      where: { id: a.id },
      data: { storage_quota_mb: 1 },
    });
    const big = Buffer.alloc(1024 * 1024, 1);
    const res = await presign(a.auth, big);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('STORAGE_QUOTA_EXCEEDED');
    expect(res.body.error.details.quotaBytes).toBe(1024 * 1024);
  });

  // 2026-10-24 (abuse batch B, item 5): bytes per day, set in the admin.
  it('refuses uploads past the daily upload cap (429 DAILY_UPLOAD_LIMIT_EXCEEDED)', async () => {
    const admin = await adminSession(base, prisma, 'super_admin');
    const set = await api()
      .put('/api/v1/admin/storage/settings')
      .set(admin.auth)
      .send({ dailyUploadMbPerUser: 1 });
    expect(set.status).toBe(200);
    expect(set.body.data.dailyUploadMbPerUser).toBe(1);
    try {
      const a = await user();
      const half = Buffer.alloc(600 * 1024, 2);
      expect((await presign(a.auth, half)).status).toBe(201);
      const res = await presign(a.auth, half);
      expect(res.status).toBe(429);
      expect(res.body.error.code).toBe('DAILY_UPLOAD_LIMIT_EXCEEDED');
      expect(res.body.error.details.limitBytes).toBe(1024 * 1024);
      expect(res.body.error.details.retryAfterSeconds).toBeGreaterThan(0);
      // another person is not affected
      const b = await user();
      expect((await presign(b.auth, half)).status).toBe(201);
    } finally {
      await api()
        .put('/api/v1/admin/storage/settings')
        .set(admin.auth)
        .send({ dailyUploadMbPerUser: 2048 })
        .expect(200);
    }
  });

  it('admin «Хранилище»: overview, settings, cleanup now, a user cap', async () => {
    const admin = await adminSession(base, prisma, 'super_admin');
    const a = await user();
    const ov = await api().get('/api/v1/admin/storage').set(admin.auth);
    expect(ov.status).toBe(200);
    expect(ov.body.data).toMatchObject({
      filesBytes: expect.any(Number),
      storedBytes: expect.any(Number),
      dedupSavedBytes: expect.any(Number),
      settings: { dedup: true, autoCleanup: true, imageFormat: 'webp' },
    });
    const put = await api()
      .put('/api/v1/admin/storage/settings')
      .set(admin.auth)
      .send({ purgeAfterDays: 10 });
    expect(put.status).toBe(200);
    expect(put.body.data.purgeAfterDays).toBe(10);
    await api()
      .put('/api/v1/admin/storage/settings')
      .set(admin.auth)
      .send({ purgeAfterDays: 7 })
      .expect(200);
    await api()
      .post('/api/v1/admin/storage/cleanup')
      .set(admin.auth)
      .expect(200);
    const q = await api()
      .put(`/api/v1/admin/storage/users/${a.id}/quota`)
      .set(admin.auth)
      .send({ quotaMb: 2048 });
    expect(q.status).toBe(200);
    expect(q.body.data).toMatchObject({ quotaMb: 2048, usedBytes: 0 });
    // A mobile token never reaches the admin routes.
    await api().get('/api/v1/admin/storage').set(a.auth).expect(401);
  });
  it('nightly: old technical logs go, a daily snapshot is kept', async () => {
    const author = await user();
    const post = await prisma.post.create({
      data: { author_id: author.id, body: 'retention check' },
    });
    const oldViewer = await user();
    const freshViewer = await user();
    const longAgo = new Date(Date.now() - 400 * 24 * 3600 * 1000);
    await prisma.postView.create({
      data: { post_id: post.id, user_id: oldViewer.id, created_at: longAgo },
    });
    await prisma.postView.create({
      data: { post_id: post.id, user_id: freshViewer.id },
    });
    const r = await app.get(DataRetentionService).run();
    expect(r).not.toBeNull();
    expect(r!.postViews).toBeGreaterThanOrEqual(1);
    const left = await prisma.postView.findMany({
      where: { post_id: post.id },
    });
    expect(left.map((v) => v.user_id)).toEqual([freshViewer.id]);
    await app.get(StorageStatsService).snapshot();
    const today = new Date(new Date().toISOString().slice(0, 10));
    const snap = await prisma.storageSnapshot.findUnique({
      where: { day: today },
    });
    expect(snap).not.toBeNull();
    expect(snap!.files_count).toBeGreaterThan(0);
  });
});
