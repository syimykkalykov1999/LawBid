import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PasswordService } from '../../src/modules/auth/services/password.service';
import { E2E_STEP_UP_PASSWORD } from './password-reauth';

/**
 * Owner 2026-11-07: a registered number signs in with its password; an SMS
 * code goes only to register a NEW number and to reset a password. Suites
 * that sign the same number in again give it a password in the database and
 * use POST /auth/password/login (same answer shape as /auth/otp/verify).
 */
export async function passwordLoginAs(
  app: INestApplication,
  target: Parameters<typeof request>[0],
  phone: string,
  deviceInfo: Record<string, unknown> = { deviceId: 'seed-device' },
) {
  const hash = await app.get(PasswordService).hash(E2E_STEP_UP_PASSWORD);
  await app.get(PrismaService).user.updateMany({
    where: { phone_e164: phone },
    data: { password_hash: hash },
  });
  return request(target)
    .post('/api/v1/auth/password/login')
    .send({ identifier: phone, password: E2E_STEP_UP_PASSWORD, deviceInfo });
}

/**
 * Signs a phone in the way the product does: a NEW number registers with its
 * SMS code (the e2e code is 000000), a registered one uses its password.
 * Returns the sign-in response (201 with tokens, or the error).
 */
export async function phoneSignIn(
  app: INestApplication,
  target: Parameters<typeof request>[0],
  phone: string,
  deviceInfo: Record<string, unknown> = { deviceId: 'seed-device' },
) {
  const known = await app.get(PrismaService).userIdentifier.findUnique({
    where: {
      provider_provider_uid: { provider: 'phone', provider_uid: phone },
    },
    select: { user_id: true },
  });
  if (known) return passwordLoginAs(app, target, phone, deviceInfo);
  await request(target)
    .post('/api/v1/auth/otp/request')
    .send({ channel: 'phone', identifier: phone })
    .expect(200);
  return request(target)
    .post('/api/v1/auth/otp/verify')
    .send({ channel: 'phone', identifier: phone, code: '000000', deviceInfo });
}
