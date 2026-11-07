import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PasswordService } from '../../src/modules/auth/services/password.service';

/** The password every e2e account gets for a step-up. */
export const E2E_STEP_UP_PASSWORD = 'Lawbid-e2e-Step-up-77';

/**
 * Owner 2026-11-07: a step-up is the account password, never an SMS code
 * (an SMS goes only to register a number and to reset a password). Gives
 * the account a password directly in the database and returns the
 * single-use token of POST /auth/reauth {method: 'password'}.
 */
export async function reauthByPassword(
  app: INestApplication,
  target: Parameters<typeof request>[0],
  auth: Record<string, string>,
  who: { userId: string } | { phone: string },
): Promise<string> {
  const hash = await app.get(PasswordService).hash(E2E_STEP_UP_PASSWORD);
  await app.get(PrismaService).user.updateMany({
    where: 'userId' in who ? { id: who.userId } : { phone_e164: who.phone },
    data: { password_hash: hash },
  });
  const res = await request(target)
    .post('/api/v1/auth/reauth')
    .set(auth)
    .send({ method: 'password', password: E2E_STEP_UP_PASSWORD })
    .expect(201);
  return (res.body as { data: { reauthToken: string } }).data.reauthToken;
}
