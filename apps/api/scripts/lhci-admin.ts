/**
 * Lighthouse CI stand (OPEN_ITEMS_SWEEP 2026-11-09 B-c11, admin-ci.yml job
 * `lighthouse`): an admin signed in the way every admin is (password → forced
 * authenticator setup → session), exactly as test/support/admin-login.ts does
 * for the e2e suites. Prints the admin JWT on stdout; the Lighthouse run puts
 * it into the admin's `lawbid_admin` cookie (extraHeaders), so the three heavy
 * pages render with real data. Never for production: the password is the
 * e2e one and the API must be the CI/local stand (API_URL).
 *
 *   npx ts-node --transpile-only scripts/lhci-admin.ts   (DATABASE_URL, API_URL=http://localhost:3000)
 */
import { PrismaClient } from '../src/generated/prisma/client';
import { randomUUID } from 'node:crypto';
import { defaultPermissionsForRole } from '../src/modules/admin-auth/admin-permissions';
import { hashSecret } from '../src/modules/admin-auth/admin-password.util';
import { totpCode } from '../src/modules/admin-auth/totp.util';
import { pgAdapter } from '../src/prisma/pg-adapter';

const PASSWORD = 'E2e-admin-pass-2026'; // test/support/admin-login.ts E2E_ADMIN_PASSWORD

async function post<T>(base: string, path: string, body: unknown): Promise<T> {
  const r = await fetch(`${base}/api/v1${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await r.json()) as { data?: T; error?: unknown };
  if (!r.ok || !json.data) {
    throw new Error(
      `${path} → ${r.status} ${JSON.stringify(json.error ?? json)}`,
    );
  }
  return json.data;
}

async function main(): Promise<void> {
  const base = (process.env.API_URL ?? 'http://localhost:3000').replace(
    /\/$/,
    '',
  );
  const prisma = new PrismaClient({
    adapter: pgAdapter(process.env.DATABASE_URL),
  });
  try {
    const tag = randomUUID().slice(0, 8);
    const email = `lhci-${tag}@lawbid-e2e.test`;
    const login = `lhci-${tag}`;
    const user = await prisma.user.create({
      data: {
        role: 'admin',
        status: 'active',
        email,
        email_verified_at: new Date(),
        admin_profile: {
          create: {
            admin_role: 'super_admin',
            permissions: defaultPermissionsForRole('super_admin'),
          },
        },
      },
    });
    await prisma.adminCredential.create({
      data: {
        user_id: user.id,
        totp_secret_enc: 'pending-setup',
        login,
        password_hash: await hashSecret(PASSWORD),
      },
    });
    const step = await post<{ ticket: string; totpSetupRequired: boolean }>(
      base,
      '/admin/auth/login/password',
      {
        login,
        password: PASSWORD,
      },
    );
    const setup = await post<{ secret: string }>(
      base,
      '/admin/auth/login/totp-setup',
      { ticket: step.ticket },
    );
    const done = await post<{ session: { accessToken: string } }>(
      base,
      '/admin/auth/login/totp-confirm',
      {
        ticket: step.ticket,
        code: totpCode(setup.secret),
      },
    );
    process.stdout.write(`${done.session.accessToken}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  process.stderr.write(`lhci-admin: ${String(e)}\n`);
  process.exit(1);
});
