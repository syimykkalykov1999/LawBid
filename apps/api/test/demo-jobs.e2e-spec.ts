import type { AddressInfo, Server } from 'node:net';
import { createHash, randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { LoggerErrorInterceptor, Logger } from 'nestjs-pino';
import { Queue } from 'bullmq';
import request from 'supertest';
import sharp from 'sharp';
import { AppModule } from '../src/app.module';
import { DemoDatabaseService } from '../src/modules/demo/demo-database.service';
import { DemoService } from '../src/modules/demo/demo.service';
import { DEMO_SETTINGS_KEY } from '../src/modules/demo/demo.settings';
import type { AdminActor } from '../src/modules/admin-auth/admin-auth.decorators';
import { MEDIA_MODERATION_QUEUE } from '../src/modules/media-moderation/media-moderation.constants';
import { bullOptions } from '../src/redis/redis-connection';

/**
 * Owner row 83 (13.11, proven on prod): a file uploaded by a DEMO account
 * stayed «pending» forever — the scan job ran outside the demo world and
 * looked for the row in the main database. Now every job carries the demo
 * flag of the request that enqueued it (common/queues/demo-job-context.ts).
 * Real stack: PostgreSQL (main + `<db>_demo`), Redis/BullMQ with the
 * in-process `files` worker, local S3, the test virus scanner.
 */
jest.setTimeout(240_000);

type Json = Record<string, unknown>;

describe('Demo world background jobs (e2e) — owner row 83', () => {
  let app: INestApplication;
  let demoDb: DemoDatabaseService;
  let baseUrl = '';
  let moderation: Queue;

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
    demoDb = app.get(DemoDatabaseService);
    // The demo seed mirrors reference data from the real database; the
    // e2e database starts without it (prod has the full lists).
    // (the seed picks two leaf practice areas per attorney).
    for (const [code, name] of [
      ['NY', 'New York'],
      ['CA', 'California'],
    ]) {
      await real().state.upsert({
        where: { code },
        create: { code, name },
        update: {},
      });
    }
    const parent = await real().practiceArea.upsert({
      where: { code: 'demo_jobs_e2e' },
      create: { code: 'demo_jobs_e2e', name_en: 'P', i18n_key: 'p', sort: 0 },
      update: {},
    });
    for (const leaf of ['a', 'b', 'c']) {
      await real().practiceArea.upsert({
        where: { code: `demo_jobs_e2e_${leaf}` },
        create: {
          code: `demo_jobs_e2e_${leaf}`,
          name_en: leaf,
          i18n_key: leaf,
          sort: 0,
          parent_id: parent.id,
        },
        update: {},
      });
    }
    // Test runs prepare the demo world only when a test asks for it.
    await demoDb.prepare();
    const state = demoDb.snapshot();
    if (!state.ready) {
      throw new Error(`demo world not ready: ${JSON.stringify(state)}`);
    }
    await real().appConfig.upsert({
      where: { key: DEMO_SETTINGS_KEY },
      create: { key: DEMO_SETTINGS_KEY, value: { enabled: true } },
      update: { value: { enabled: true } },
    });
    moderation = new Queue(
      MEDIA_MODERATION_QUEUE,
      bullOptions(MEDIA_MODERATION_QUEUE, process.env.REDIS_URL!),
    );
  });

  afterAll(async () => {
    await moderation?.close();
    await app.close();
  });

  const real = () => demoDb.realClient();
  const api = () => request(baseUrl);
  const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  /** A demo account made by the team and entered with its code, as a
   * blogger does it in the app. */
  async function demoLogin(): Promise<Record<string, string>> {
    const admin = { id: randomUUID(), ip: null } as unknown as AdminActor;
    const created = await app
      .get(DemoService)
      .adminCreate(admin, { role: 'client', withInvite: true } as never);
    const res = await api()
      .post('/api/v1/demo/invites/redeem')
      .set('X-Device-Id', 'demo-jobs-e2e')
      .send({ code: created.inviteCode })
      .expect(200);
    const token = (res.body as { data: { tokens: { accessToken: string } } })
      .data.tokens.accessToken;
    return { Authorization: `Bearer ${token}`, 'X-LawBid-Demo': '1' };
  }

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

  async function settled(
    auth: Record<string, string>,
    id: string,
  ): Promise<Json> {
    for (let i = 0; i < 150; i += 1) {
      const res = await api().get(`/api/v1/files/${id}`).set(auth).expect(200);
      const f = (res.body as { data: Json }).data;
      if (f.scanStatus !== 'pending') return f;
      await sleep(200);
    }
    throw new Error('scan did not finish (still pending)');
  }

  it('a demo upload is scanned in the demo world and ends clean', async () => {
    const auth = await demoLogin();
    const data = await sharp({
      create: { width: 64, height: 64, channels: 3, background: '#1b2a4a' },
    })
      .jpeg()
      .toBuffer();
    const presigned = await api()
      .post('/api/v1/files/presign')
      .set(auth)
      .send({
        purpose: 'avatar',
        mime: 'image/jpeg',
        sizeBytes: data.length,
        sha256: sha(data),
      })
      .expect(201);
    const p = (presigned.body as Json).data as {
      fileId: string;
      upload: { url: string; fields: Record<string, string> };
    };
    expect(p.upload.fields.key).toMatch(/demo\//);
    expect(await uploadTo(p.upload, data, 'image/jpeg')).toBe(204);
    await api().post(`/api/v1/files/${p.fileId}/confirm`).set(auth).expect(200);

    const file = await settled(auth, p.fileId);
    expect(file.scanStatus).toBe('clean');

    // The row lives in the demo database only; the main one never saw it.
    const demoRow = await demoDb
      .rawDemoClient()!
      .file.findUnique({ where: { id: p.fileId } });
    expect(demoRow?.scan_status).toBe('clean');
    const realRow = await real().file.findUnique({
      where: { id: p.fileId },
    });
    expect(realRow).toBeNull();

    // Outbound/paid checks stay off for the demo world: no moderation job.
    expect(await moderation.getJob(`file-${p.fileId}`)).toBeUndefined();
  });

  it('a normal upload still runs in the real world (no flag on its job)', async () => {
    // Unchanged path: the real-world files e2e covers the scan; here only
    // the job itself — enqueued outside demo, it carries no telemetry.
    const files = new Queue(
      'files',
      bullOptions('files', process.env.REDIS_URL!),
    );
    try {
      const id = randomUUID();
      const job = await files.add(
        'files.noop-probe',
        { fileId: id },
        {
          jobId: `probe-${id}`,
          delay: 60_000,
        },
      );
      const stored = await files.getJob(job.id!);
      expect(stored?.opts.telemetry).toBeUndefined();
      expect(stored?.id).toBe(`probe-${id}`);
      await stored?.remove();
    } finally {
      await files.close();
    }
  });
});
