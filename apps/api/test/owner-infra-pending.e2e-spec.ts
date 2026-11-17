import type { AddressInfo, Server } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AppSettingsService } from '../src/common/app-settings/app-settings.service';
import { InfraGithubClient } from '../src/modules/admin-launch/infra/infra-github.client';
import { totpCode } from '../src/modules/admin-auth/totp.util';
import { adminSession } from './support/admin-login';

/**
 * Owner 17.11 «Применить изменения из кода»: POST /admin/infra/requests/
 * pending → the workflow plans (mocked here: GitHub is never called, the
 * OIDC check and the dispatch are stubbed) → the confirm needs the owner's
 * fresh 2FA code, exactly like a switch → apply → done. Nothing reaches AWS.
 */
jest.setTimeout(120_000);

const ACTIVE = ['requested', 'planning', 'planned', 'confirmed', 'applying'];
const RUN = {
  runId: 'e2e-pending-1',
  runUrl: 'https://github.com/o/r/actions/runs/1',
};
const WF = { authorization: 'Bearer e2e-oidc' };

describe('Infra «Применить изменения из кода» (e2e, owner 17.11)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let base = '';
  const made: string[] = [];

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

    const github = app.get(InfraGithubClient);
    jest.spyOn(github, 'configured').mockResolvedValue(true);
    jest.spyOn(github, 'dispatch').mockResolvedValue(undefined);
    jest.spyOn(github, 'verifyCaller').mockResolvedValue(RUN);
    // infra.dry_run is on by default; the real path is tested here.
    const settings = app.get(AppSettingsService);
    const boolean = settings.boolean.bind(settings);
    jest
      .spyOn(settings, 'boolean')
      .mockImplementation(async (k) =>
        k === 'infra.dry_run' ? false : boolean(k),
      );
    // One request at a time: nothing left over from another suite.
    await prisma.infraChangeRequest.updateMany({
      where: { status: { in: ACTIVE } },
      data: { status: 'cancelled', finished_at: new Date() },
    });
  });

  afterAll(async () => {
    if (made.length) {
      await prisma.infraChangeRequest.deleteMany({
        where: { id: { in: made } },
      });
    }
    await app.close();
  });

  const api = () => request(base);

  it('create → plan (mocked) → confirm needs a fresh 2FA code → apply → done', async () => {
    const admin = await adminSession(base, prisma, 'super_admin');
    const created = await api()
      .post('/api/v1/admin/infra/requests/pending')
      .set(admin.auth)
      .send({})
      .expect(201);
    const r = created.body.data as Record<string, unknown> & { id: string };
    made.push(r.id);
    expect(r).toMatchObject({
      itemId: 'aws.pending',
      itemName: 'Изменения из кода',
      toState: 'pending',
      changes: {},
      status: 'requested',
      dryRun: false,
    });

    // A second one while it runs: one change at a time.
    const busy = await api()
      .post('/api/v1/admin/infra/requests/pending')
      .set(admin.auth)
      .send({});
    expect(busy.status).toBe(409);

    // The workflow takes the job (nothing to write) and reports the plan.
    const job = await api()
      .post(`/api/v1/infra/workflow/requests/${r.id}/start`)
      .set(WF)
      .send({})
      .expect(200);
    expect(job.body.data).toMatchObject({ itemId: 'aws.pending', changes: {} });
    const planned = await api()
      .post(`/api/v1/infra/workflow/requests/${r.id}/plan`)
      .set(WF)
      .send({
        add: 0,
        change: 1,
        destroy: 0,
        resources: [
          {
            address: 'module.stack.module.s3.aws_cloudfront_distribution.media',
            action: 'update',
          },
        ],
        fileBefore: {},
      })
      .expect(200);
    expect(planned.body.data.status).toBe('planned');

    // The overview lists it with the other requests.
    const overview = await api()
      .get('/api/v1/admin/infra')
      .set(admin.auth)
      .expect(200);
    expect(
      (overview.body.data.requests as { id: string }[]).map((x) => x.id),
    ).toContain(r.id);

    // No confirm without a fresh 2FA code.
    const refused = await api()
      .post(`/api/v1/admin/infra/requests/${r.id}/confirm`)
      .set(admin.auth)
      .send({});
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe('ADMIN_STEP_UP_REQUIRED');
    const wait = await api()
      .get(`/api/v1/infra/workflow/requests/${r.id}/decision`)
      .set(WF)
      .expect(200);
    expect(wait.body.data).toMatchObject({ decision: 'wait', auto: false });

    await api()
      .post('/api/v1/admin/auth/step-up')
      .set(admin.auth)
      .send({ code: totpCode(admin.totpSecret, Date.now() + 30_000) })
      .expect(200);
    const ok = await api()
      .post(`/api/v1/admin/infra/requests/${r.id}/confirm`)
      .set(admin.auth)
      .send({})
      .expect(200);
    expect(ok.body.data.status).toBe('confirmed');
    const go = await api()
      .get(`/api/v1/infra/workflow/requests/${r.id}/decision`)
      .set(WF)
      .expect(200);
    expect(go.body.data).toMatchObject({ decision: 'apply', auto: false });

    await api()
      .post(`/api/v1/infra/workflow/requests/${r.id}/status`)
      .set(WF)
      .send({ status: 'applying' })
      .expect(200);
    const done = await api()
      .post(`/api/v1/infra/workflow/requests/${r.id}/status`)
      .set(WF)
      .send({ status: 'done', recorded: 'main' })
      .expect(200);
    expect(done.body.data.status).toBe('done');

    // Code changes are rolled back in code, not from here.
    const back = await api()
      .post(`/api/v1/admin/infra/requests/${r.id}/rollback`)
      .set(admin.auth)
      .send({});
    expect(back.status).toBe(409);
  });

  it('a plan from code that replaces the CDN is refused and the request fails', async () => {
    const admin = await adminSession(base, prisma, 'super_admin');
    const created = await api()
      .post('/api/v1/admin/infra/requests/pending')
      .set(admin.auth)
      .send({})
      .expect(201);
    const id = (created.body.data as { id: string }).id;
    made.push(id);
    await api()
      .post(`/api/v1/infra/workflow/requests/${id}/start`)
      .set(WF)
      .send({})
      .expect(200);
    const bad = await api()
      .post(`/api/v1/infra/workflow/requests/${id}/plan`)
      .set(WF)
      .send({
        add: 1,
        change: 0,
        destroy: 1,
        resources: [
          {
            address: 'module.stack.module.s3.aws_cloudfront_distribution.media',
            action: 'delete-create',
          },
        ],
        fileBefore: {},
      });
    expect(bad.status).toBe(409);
    const row = await prisma.infraChangeRequest.findUniqueOrThrow({
      where: { id },
    });
    expect(row.status).toBe('failed');
    expect(row.error).toContain('aws_cloudfront_distribution.media');
  });
});
