import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Owner 2026-10-20: sign in to the website by scanning its QR code. Real
 * PostgreSQL + Redis: the state changes are Lua scripts, a fake would prove
 * nothing. NODE_ENV=test + OTP_DEV_FIXED_CODE=true give the phone login its
 * code '000000'.
 */
describe('Auth QR login (e2e)', () => {
  let app: INestApplication;

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
    app.setGlobalPrefix('api/v1', {
      exclude: ['/health/live', '/health/ready', '/docs', '/docs-json'],
    });
    await app.init();
    await app.listen(0, '127.0.0.1');
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(app.getHttpServer());

  async function phoneLogin(identifier: string, platform = 'android') {
    await api()
      .post('/api/v1/auth/otp/request')
      .send({ channel: 'phone', identifier })
      .expect(200);
    const res = await api()
      .post('/api/v1/auth/otp/verify')
      .send({
        channel: 'phone',
        identifier,
        code: '000000',
        deviceInfo: { deviceId: `qr-${platform}-${identifier}`, platform },
      })
      .expect(201);
    return res.body.data.accessToken as string;
  }

  async function newCode() {
    const res = await api()
      .post('/api/v1/auth/qr')
      .set(
        'User-Agent',
        'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
      )
      // A phisher's own label is ignored: the name comes from the User-Agent.
      .send({
        deviceInfo: { deviceId: 'browser-1', deviceName: 'LawBid Bank' },
      })
      .expect(201);
    return res.body.data as {
      qrId: string;
      pollSecret: string;
      qrUrl: string;
      expiresIn: number;
    };
  }

  const poll = (qrId: string, pollSecret: string) =>
    api().post('/api/v1/auth/qr/poll').send({ qrId, pollSecret });

  it('the whole flow: code → scan → approve → the browser gets its own session once', async () => {
    const phone = await phoneLogin('+12025552001');
    const qr = await newCode();
    expect(qr.qrUrl).toContain(`/q/${qr.qrId}`);
    expect(qr.expiresIn).toBe(120);

    expect((await poll(qr.qrId, qr.pollSecret)).body.data.status).toBe(
      'pending',
    );

    const preview = await api()
      .get(`/api/v1/auth/qr/${qr.qrId}`)
      .set('Authorization', `Bearer ${phone}`)
      .expect(200);
    expect(preview.body.data.deviceName).toBe('Chrome · Windows');
    expect(preview.body.data.platform).toBe('web');
    expect((await poll(qr.qrId, qr.pollSecret)).body.data.status).toBe(
      'scanned',
    );

    await api()
      .post(`/api/v1/auth/qr/${qr.qrId}/approve`)
      .set('Authorization', `Bearer ${phone}`)
      .expect(200);

    const done = await poll(qr.qrId, qr.pollSecret);
    expect(done.body.data.status).toBe('approved');
    expect(done.body.data.accessToken).toEqual(expect.any(String));
    expect(done.body.data.refreshToken).toEqual(expect.any(String));

    // Single use: the same code gives nothing again.
    expect((await poll(qr.qrId, qr.pollSecret)).body.data.status).toBe(
      'expired',
    );

    // The new web session works and is listed as a website.
    const sessions = await api()
      .get('/api/v1/auth/sessions')
      .set('Authorization', `Bearer ${done.body.data.accessToken}`)
      .expect(200);
    const rows = sessions.body.data as {
      isCurrent: boolean;
      platform: string;
      deviceName: string;
    }[];
    const web = rows.find((s) => s.isCurrent)!;
    expect(web.platform).toBe('web');
    expect(web.deviceName).toBe('Chrome · Windows');
  });

  it('a wrong poll secret never collects the tokens', async () => {
    const phone = await phoneLogin('+12025552002');
    const qr = await newCode();
    await api()
      .get(`/api/v1/auth/qr/${qr.qrId}`)
      .set('Authorization', `Bearer ${phone}`)
      .expect(200);
    await api()
      .post(`/api/v1/auth/qr/${qr.qrId}/approve`)
      .set('Authorization', `Bearer ${phone}`)
      .expect(200);
    const stolen = await poll(qr.qrId, 'A'.repeat(32));
    expect(stolen.body.data.status).toBe('expired');
    expect(stolen.body.data.accessToken).toBeNull();
    // The rightful browser still gets in.
    expect((await poll(qr.qrId, qr.pollSecret)).body.data.status).toBe(
      'approved',
    );
  });

  it('approve needs the scan first, and only the phone that scanned may answer', async () => {
    const phoneA = await phoneLogin('+12025552003');
    const phoneB = await phoneLogin('+12025552004');
    const qr = await newCode();
    await api()
      .post(`/api/v1/auth/qr/${qr.qrId}/approve`)
      .set('Authorization', `Bearer ${phoneA}`)
      .expect(404);
    await api()
      .get(`/api/v1/auth/qr/${qr.qrId}`)
      .set('Authorization', `Bearer ${phoneA}`)
      .expect(200);
    await api()
      .get(`/api/v1/auth/qr/${qr.qrId}`)
      .set('Authorization', `Bearer ${phoneB}`)
      .expect(404);
    await api()
      .post(`/api/v1/auth/qr/${qr.qrId}/approve`)
      .set('Authorization', `Bearer ${phoneB}`)
      .expect(404);
  });

  it('refusing on the phone tells the browser', async () => {
    const phone = await phoneLogin('+12025552005');
    const qr = await newCode();
    await api()
      .get(`/api/v1/auth/qr/${qr.qrId}`)
      .set('Authorization', `Bearer ${phone}`)
      .expect(200);
    await api()
      .post(`/api/v1/auth/qr/${qr.qrId}/reject`)
      .set('Authorization', `Bearer ${phone}`)
      .expect(200);
    const res = await poll(qr.qrId, qr.pollSecret);
    expect(res.body.data.status).toBe('rejected');
    expect(res.body.data.accessToken).toBeNull();
  });

  it('a browser session cannot approve (only a phone)', async () => {
    const phone = await phoneLogin('+12025552006');
    const qr1 = await newCode();
    await api()
      .get(`/api/v1/auth/qr/${qr1.qrId}`)
      .set('Authorization', `Bearer ${phone}`)
      .expect(200);
    await api()
      .post(`/api/v1/auth/qr/${qr1.qrId}/approve`)
      .set('Authorization', `Bearer ${phone}`)
      .expect(200);
    const web = (await poll(qr1.qrId, qr1.pollSecret)).body.data
      .accessToken as string;
    const qr2 = await newCode();
    await api()
      .get(`/api/v1/auth/qr/${qr2.qrId}`)
      .set('Authorization', `Bearer ${web}`)
      .expect(404);
  });

  it('an unknown code is 404 for the phone and expired for the browser', async () => {
    const phone = await phoneLogin('+12025552007');
    await api()
      .get('/api/v1/auth/qr/doesNotExist0123456789')
      .set('Authorization', `Bearer ${phone}`)
      .expect(404);
    expect(
      (await poll('doesNotExist0123456789', 'B'.repeat(32))).body.data.status,
    ).toBe('expired');
  });

  it('needs a signed-in phone to scan', async () => {
    const qr = await newCode();
    await api().get(`/api/v1/auth/qr/${qr.qrId}`).expect(401);
  });
});
