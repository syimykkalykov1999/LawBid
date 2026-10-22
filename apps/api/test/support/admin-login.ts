import type { AdminRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { defaultPermissionsForRole } from '../../src/modules/admin-auth/admin-permissions';
import { hashSecret } from '../../src/modules/admin-auth/admin-password.util';
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
 * starting toggles), gives it a login + password, and signs in the way
 * every admin does since owner 2026-10-22: password → the forced
 * authenticator setup (QR secret + first code) → session, so suites get a
 * known TOTP secret and recovery codes.
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
  const login = e2eLogin(email);
  await prisma.adminCredential.upsert({
    where: { user_id: userId },
    create: {
      user_id: userId,
      totp_secret_enc: 'pending-setup',
      login,
      password_hash: await hashSecret(E2E_ADMIN_PASSWORD),
    },
    update: { login, password_hash: await hashSecret(E2E_ADMIN_PASSWORD) },
  });
  const api = () => request(baseUrl);
  const first = await api()
    .post('/api/v1/admin/auth/login/password')
    .send({ login, password: E2E_ADMIN_PASSWORD })
    .expect(200);
  const step = (
    first.body as { data: { ticket: string; totpSetupRequired: boolean } }
  ).data;
  if (!step.totpSetupRequired) {
    throw new Error(
      'adminSession(): this admin already has TOTP bound; sign in with adminSignIn()',
    );
  }
  const setup = await api()
    .post('/api/v1/admin/auth/login/totp-setup')
    .send({ ticket: step.ticket })
    .expect(200);
  const secret = (setup.body as { data: { secret: string } }).data.secret;
  const done = await api()
    .post('/api/v1/admin/auth/login/totp-confirm')
    .send({ ticket: step.ticket, code: totpCode(secret) });
  if (done.status !== 200) {
    throw new Error(
      `admin totp setup ${done.status}: ${JSON.stringify(done.body)}`,
    );
  }
  const data = (
    done.body as {
      data: { recoveryCodes: string[]; session: { accessToken: string } };
    }
  ).data;
  const accessToken = data.session.accessToken;
  return {
    auth: { Authorization: `Bearer ${accessToken}` },
    userId,
    email,
    accessToken,
    recoveryCodes: data.recoveryCodes,
    totpSecret: secret,
  };
}

/** The password every e2e admin gets (never a real credential). */
export const E2E_ADMIN_PASSWORD = 'E2e-admin-pass-2026';

/** A valid admin login derived from the e2e email. */
export function e2eLogin(email: string): string {
  const local = email
    .split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-');
  return local.padEnd(4, '0').slice(0, 40);
}

/** A later sign-in of an already enrolled admin (known TOTP secret). */
export async function adminSignIn(
  baseUrl: string,
  email: string,
  totpSecret: string,
): Promise<{ auth: Record<string, string>; accessToken: string }> {
  const api = () => request(baseUrl);
  const first = await api()
    .post('/api/v1/admin/auth/login/password')
    .send({ login: e2eLogin(email), password: E2E_ADMIN_PASSWORD })
    .expect(200);
  const { ticket } = (first.body as { data: { ticket: string } }).data;
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
