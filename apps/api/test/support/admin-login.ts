import type { AdminRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { totpCode } from '../../src/modules/admin-auth/totp.util';

export interface AdminSession {
  auth: Record<string, string>;
  userId: string;
  email: string;
  accessToken: string;
  recoveryCodes: string[];
  totpSecret: string;
}

/**
 * docs/06 §2.1 admin sign-in for e2e suites: creates an active admin with
 * [role] (or reuses [existing]), then runs email code (OTP_DEV_FIXED_CODE)
 * → first-time TOTP enrollment → session. Returns the Bearer header the
 * `/admin/*` routes accept (mobile tokens are refused there).
 */
export async function adminSession(
  baseUrl: string,
  prisma: PrismaService,
  role: AdminRole | null,
  existing?: { userId: string; email: string },
): Promise<AdminSession> {
  let userId = existing?.userId;
  let email = existing?.email;
  if (!userId || !email) {
    email = `admin-${randomUUID().slice(0, 8)}@lawbid-e2e.test`;
    const user = await prisma.user.create({
      data: {
        role: 'admin',
        status: 'active',
        email,
        email_verified_at: new Date(),
        ...(role ? { admin_profile: { create: { admin_role: role } } } : {}),
      },
    });
    userId = user.id;
  }
  if (!role) {
    // An admin without a profile can't sign in; callers only need the id.
    return {
      auth: {},
      userId,
      email,
      accessToken: '',
      recoveryCodes: [],
      totpSecret: '',
    };
  }
  const api = () => request(baseUrl);
  await api()
    .post('/api/v1/admin/auth/login/start')
    .send({ email })
    .expect(204);
  const verify = await api()
    .post('/api/v1/admin/auth/login/verify')
    .send({ email, code: '000000' })
    .expect(200);
  const { ticket, totpEnrollment } = (
    verify.body as {
      data: {
        ticket: string;
        totpEnrollment: { secret: string } | null;
      };
    }
  ).data;
  const secret = totpEnrollment?.secret;
  if (!secret) {
    throw new Error(
      'adminSession(): this admin already has TOTP bound; sign in with adminSignIn()',
    );
  }
  const session = await api()
    .post('/api/v1/admin/auth/totp')
    .send({ ticket, code: totpCode(secret) })
    .expect(200);
  const data = (
    session.body as {
      data: { accessToken: string; recoveryCodes?: string[] };
    }
  ).data;
  return {
    auth: { Authorization: `Bearer ${data.accessToken}` },
    userId,
    email,
    accessToken: data.accessToken,
    recoveryCodes: data.recoveryCodes ?? [],
    totpSecret: secret,
  };
}

/** A later sign-in of an already enrolled admin (known TOTP secret). */
export async function adminSignIn(
  baseUrl: string,
  email: string,
  totpSecret: string,
): Promise<{ auth: Record<string, string>; accessToken: string }> {
  const api = () => request(baseUrl);
  await api()
    .post('/api/v1/admin/auth/login/start')
    .send({ email })
    .expect(204);
  const verify = await api()
    .post('/api/v1/admin/auth/login/verify')
    .send({ email, code: '000000' })
    .expect(200);
  const { ticket } = (verify.body as { data: { ticket: string } }).data;
  const session = await api()
    .post('/api/v1/admin/auth/totp')
    .send({ ticket, code: totpCode(totpSecret) })
    .expect(200);
  const { accessToken } = (session.body as { data: { accessToken: string } })
    .data;
  return { auth: { Authorization: `Bearer ${accessToken}` }, accessToken };
}
