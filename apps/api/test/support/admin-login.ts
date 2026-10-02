import type { AdminRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { defaultPermissionsForRole } from '../../src/modules/admin-auth/admin-permissions';
import { totpCode } from '../../src/modules/admin-auth/totp.util';

/** Toggles of a hands-on support / moderation admin for suites that
 * exercise user, case and ticket actions (roles are only labels now). */
export const OPS_RIGHTS: Record<string, string> = {
  dashboard: 'view',
  users: 'manage',
  moderation: 'manage',
  content: 'manage',
  media: 'manage',
  cases: 'manage',
  support: 'manage',
  data_requests: 'manage',
};

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
 * [role] (or reuses [existing]; [permissions] default to the role's
 * starting toggles), signs in with the emailed code (OTP_DEV_FIXED_CODE;
 * two-factor is off by default, so that is a session), then turns
 * two-factor on so suites get a known TOTP secret and recovery codes.
 * Returns the Bearer header the `/admin/*` routes accept (mobile tokens are
 * refused there).
 */
export async function adminSession(
  baseUrl: string,
  prisma: PrismaService,
  role: AdminRole | null,
  existing?: { userId: string; email: string },
  permissions?: Record<string, string | boolean>,
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
        ...(role
          ? {
              admin_profile: {
                create: {
                  admin_role: role,
                  permissions: permissions ?? defaultPermissionsForRole(role),
                },
              },
            }
          : {}),
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
  const login = (
    verify.body as {
      data: { ticket: string | null; session: { accessToken: string } | null };
    }
  ).data;
  if (!login.session) {
    throw new Error(
      'adminSession(): this admin already has TOTP bound; sign in with adminSignIn()',
    );
  }
  const accessToken = login.session.accessToken;
  const auth = { Authorization: `Bearer ${accessToken}` };
  const begin = await api()
    .post('/api/v1/admin/auth/2fa/begin')
    .set(auth)
    .expect(200);
  const secret = (begin.body as { data: { secret: string } }).data.secret;
  const enabled = await api()
    .post('/api/v1/admin/auth/2fa/enable')
    .set(auth)
    .send({ code: totpCode(secret) });
  if (enabled.status !== 200) {
    throw new Error(
      `admin 2fa enable ${enabled.status}: ${JSON.stringify(enabled.body)}`,
    );
  }
  const recoveryCodes = (enabled.body as { data: { recoveryCodes: string[] } })
    .data.recoveryCodes;
  return {
    auth,
    userId,
    email,
    accessToken,
    recoveryCodes,
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
  if (!ticket) throw new Error('adminSignIn(): this admin has no TOTP bound');
  // The next 30-second step: a code is single-use inside its window
  // (replay guard), and this sign-in usually follows the enrollment one
  // within seconds.
  const session = await api()
    .post('/api/v1/admin/auth/totp')
    .send({ ticket, code: totpCode(totpSecret, Date.now() + 30_000) })
    .expect(200);
  const { accessToken } = (session.body as { data: { accessToken: string } })
    .data;
  return { auth: { Authorization: `Bearer ${accessToken}` }, accessToken };
}
