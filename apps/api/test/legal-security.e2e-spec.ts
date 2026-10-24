import type { AddressInfo, Server } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { LoggerErrorInterceptor, Logger } from 'nestjs-pino';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { FilesService } from '../src/modules/files/files.service';
import { PasswordService } from '../src/modules/auth/services/password.service';
import { viewerContext } from '../src/common/viewer/viewer-context';

/**
 * Security & legal pass 2026-10-24: (1) a person other than the owner who
 * is handed a link to a confidential file leaves a journal row the owner can
 * read — and only the owner; (2) an attorney with a passkey cannot be signed
 * in by the password alone (`security.attorney_strong_auth`).
 */
jest.setTimeout(60_000);

describe('Legal-grade document protection (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl = '';
  let seq = 0;

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
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(baseUrl);

  async function signUp(): Promise<{
    id: string;
    phone: string;
    auth: Record<string, string>;
  }> {
    seq += 1;
    const phone = `+1202555${String(7400 + seq).padStart(4, '0')}`;
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
        deviceInfo: { deviceId: `legal-e2e-${seq}` },
      })
      .expect(201);
    const token = (res.body as { data: { accessToken: string } }).data
      .accessToken;
    const me = await prisma.userIdentifier.findFirstOrThrow({
      where: { provider_uid: phone },
    });
    return {
      id: me.user_id,
      phone,
      auth: { Authorization: `Bearer ${token}` },
    };
  }

  it('records who opened a confidential file and shows it to the owner only', async () => {
    const owner = await signUp();
    const viewer = await signUp();
    const file = await prisma.file.create({
      data: {
        owner_user_id: owner.id,
        purpose: 'chat_attachment',
        s3_bucket: 'lawbid-documents',
        s3_key: `chat_attachment/${owner.id}/legal-e2e-${seq}`,
        mime: 'application/pdf',
        size_bytes: 10n,
        sha256: 'a'.repeat(64),
        scan_status: 'clean',
      },
    });
    const files = app.get(FilesService);

    // The owner opening their own file leaves nothing.
    await viewerContext.run(owner.id, () => files.attachmentUrls([file.id]));
    await new Promise((r) => setTimeout(r, 300));
    expect(
      await prisma.fileAccessLog.count({ where: { file_id: file.id } }),
    ).toBe(0);

    // Somebody else does.
    const urls = await viewerContext.run(
      viewer.id,
      () => files.attachmentUrls([file.id]),
      { sessionId: '11111111-1111-4111-8111-111111111111', ip: '203.0.113.7' },
    );
    expect(urls.get(file.id)?.url).toContain('http');
    await new Promise((r) => setTimeout(r, 300));
    const rows = await prisma.fileAccessLog.findMany({
      where: { file_id: file.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      owner_user_id: owner.id,
      viewer_user_id: viewer.id,
      purpose: 'chat_attachment',
      ip: '203.0.113.7',
    });

    // Opening again within the window does not add a row.
    await viewerContext.run(viewer.id, () => files.attachmentUrls([file.id]));
    await new Promise((r) => setTimeout(r, 300));
    expect(
      await prisma.fileAccessLog.count({ where: { file_id: file.id } }),
    ).toBe(1);

    const ownerView = await api()
      .get(`/api/v1/files/${file.id}/views`)
      .set(owner.auth)
      .expect(200);
    const list = (ownerView.body as { data: { viewerUserId: string }[] }).data;
    expect(list).toHaveLength(1);
    expect(list[0].viewerUserId).toBe(viewer.id);

    await api()
      .get(`/api/v1/files/${file.id}/views`)
      .set(viewer.auth)
      .expect(404);
  });

  it('an attorney with a passkey is refused a password-only sign-in', async () => {
    const attorney = await signUp();
    const hash = await new PasswordService().hash('Strong-Pass-123!');
    await prisma.user.update({
      where: { id: attorney.id },
      data: {
        role: 'attorney',
        password_hash: hash,
        password_set_at: new Date(),
      },
    });
    const login = () =>
      api()
        .post('/api/v1/auth/password/login')
        .send({
          identifier: attorney.phone,
          password: 'Strong-Pass-123!',
          deviceInfo: { deviceId: 'legal-e2e-pwd' },
        });

    await prisma.webauthnCredential.create({
      data: {
        user_id: attorney.id,
        scope: 'user',
        credential_id: `legal-e2e-cred-${attorney.id}`,
        public_key: Buffer.from('k'),
        device_type: 'multiDevice',
        name: 'Test key',
      },
    });
    const refused = await login().expect(403);
    expect((refused.body as { error: { code: string } }).error.code).toBe(
      'AUTH_PROVIDER_DISABLED',
    );
  });
});
