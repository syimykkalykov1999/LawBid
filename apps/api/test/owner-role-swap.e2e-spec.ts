import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Owner 2026-10-15: a person who started on the lawyer side (even opened
 * «add a state» on the verification step, which makes a DRAFT request) can go
 * back and pick Client. A request that was SENT keeps the role final.
 */
jest.setTimeout(90_000);

describe('Role swap during onboarding (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let base = '';
  let seq = 0;

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
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(base);

  async function attorneyWithDraft(status: 'draft' | 'submitted') {
    seq += 1;
    const phone = `+1415555${String(9500 + seq).padStart(4, '0')}`;
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
        deviceInfo: { deviceId: 'role-swap-e2e' },
      })
      .expect(201);
    const auth = {
      Authorization: `Bearer ${(res.body as { data: { accessToken: string } }).data.accessToken}`,
    };
    const me = await api().get('/api/v1/users/me').set(auth).expect(200);
    const userId = (me.body as { data: { id: string } }).data.id;
    const username = `swap_${randomUUID().slice(0, 8)}`;
    await prisma.user.update({
      where: { id: userId },
      data: { role: 'attorney', first_name: 'Half', last_name: 'Done' },
    });
    await prisma.attorneyProfile.create({
      data: {
        user_id: userId,
        username,
        username_lower: username.toLowerCase(),
        verification_status: 'unverified',
        languages: ['en'],
      },
    });
    await prisma.verificationRequest.create({
      data: {
        attorney_id: userId,
        status,
        submitted_at: status === 'draft' ? null : new Date(),
      },
    });
    return { auth, userId };
  }

  it('a draft verification request does not lock the role: Client can be picked and the half-made lawyer data goes', async () => {
    const { auth, userId } = await attorneyWithDraft('draft');
    const res = await api()
      .post('/api/v1/users/me/role')
      .set(auth)
      .set('Idempotency-Key', randomUUID())
      .send({ role: 'client' })
      .expect(200);
    expect((res.body as { data: { role: string } }).data.role).toBe('client');
    expect(
      await prisma.verificationRequest.count({
        where: { attorney_id: userId },
      }),
    ).toBe(0);
    expect(
      await prisma.attorneyProfile.count({ where: { user_id: userId } }),
    ).toBe(0);
  });

  it('a request that was sent keeps the role final', async () => {
    const { auth, userId } = await attorneyWithDraft('submitted');
    const res = await api()
      .post('/api/v1/users/me/role')
      .set(auth)
      .set('Idempotency-Key', randomUUID())
      .send({ role: 'client' })
      .expect(409);
    expect((res.body as { error: { code: string } }).error.code).toBe(
      'ROLE_ALREADY_SET',
    );
    expect(
      await prisma.verificationRequest.count({
        where: { attorney_id: userId },
      }),
    ).toBe(1);
  });
});
