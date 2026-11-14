// Click audit fixtures on top of `prisma/seed.ts` + `prisma/seed-demo.ts`
// (tests/click-audit/README.md). LOCAL databases only: refuses anything that
// does not point at localhost.
//
//   cd apps/api && npx ts-node --transpile-only ../../tests/click-audit/setup/seed-audit.ts
//
// - an owner admin (super_admin, workspace owner) with a login + password and
//   NO authenticator yet: the suite's first sign-in goes through the real
//   setup screen and keeps the secret in tests/click-audit/.auth/;
// - one demo client and one demo attorney get a phone + password so the web
//   app can sign in the way users do (phone + password).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '../../../apps/api/src/generated/prisma/client';
import { hashSecret } from '../../../apps/api/src/modules/admin-auth/admin-password.util';
import { defaultPermissionsForRole } from '../../../apps/api/src/modules/admin-auth/admin-permissions';
import { PasswordService } from '../../../apps/api/src/modules/auth/services/password.service';
import { pgAdapter } from '../../../apps/api/src/prisma/pg-adapter';

interface Fixtures {
  admin: { email: string; login: string; password: string };
  client: { phone: string; password: string };
  attorney: { phone: string; password: string };
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? '';
  if (!/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) {
    throw new Error('seed-audit: DATABASE_URL must point at a local database');
  }
  const fx = JSON.parse(
    readFileSync(join(__dirname, 'fixtures.json'), 'utf8'),
  ) as Fixtures;
  const prisma = new PrismaClient({ adapter: pgAdapter(process.env.DATABASE_URL) });
  try {
    const admin = await prisma.user.upsert({
      where: { email: fx.admin.email },
      create: {
        role: 'admin',
        status: 'active',
        email: fx.admin.email,
        email_verified_at: new Date(),
      },
      update: {},
    });
    await prisma.adminProfile.upsert({
      where: { user_id: admin.id },
      create: {
        user_id: admin.id,
        admin_role: 'super_admin',
        workspace: 'owner',
        permissions: defaultPermissionsForRole('super_admin') as object,
      },
      update: { admin_role: 'super_admin', workspace: 'owner' },
    });
    const passwordHash = await hashSecret(fx.admin.password);
    await prisma.adminCredential.upsert({
      where: { user_id: admin.id },
      create: {
        user_id: admin.id,
        totp_secret_enc: 'pending-setup',
        login: fx.admin.login,
        password_hash: passwordHash,
      },
      // A re-run keeps the authenticator the suite already bound
      // (its secret is in tests/click-audit/.auth/).
      update: { login: fx.admin.login, password_hash: passwordHash },
    });

    const users = new PasswordService();
    for (const [role, who] of [
      ['client', fx.client],
      ['attorney', fx.attorney],
    ] as const) {
      const existing =
        (await prisma.user.findUnique({ where: { phone_e164: who.phone } })) ??
        (await prisma.user.findFirst({
          where: { role, status: 'active', phone_e164: null },
          orderBy: { created_at: 'asc' },
        }));
      if (!existing) throw new Error(`seed-audit: no demo ${role}; run seed:demo first`);
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          phone_e164: who.phone,
          phone_verified_at: new Date(),
          password_hash: await users.hash(who.password),
          password_set_at: new Date(),
        },
      });
      // Password sign-in finds the account through its identifier row.
      await prisma.userIdentifier.upsert({
        where: { provider_provider_uid: { provider: 'phone', provider_uid: who.phone } },
        create: { user_id: existing.id, provider: 'phone', provider_uid: who.phone, verified_at: new Date() },
        update: { user_id: existing.id, verified_at: new Date() },
      });
      // The demo world fills the profile but not the onboarding record; the
      // suite still walks the consent screens itself (user_consents).
      await prisma.onboardingState.upsert({
        where: { user_id: existing.id },
        create: { user_id: existing.id, current_step: 'finish', completed_at: new Date() },
        update: { completed_at: new Date() },
      });
      console.log(`${role}: ${existing.id} ${who.phone}`);
    }
    // The local web build is a «web» origin, so its refresh token lives in
    // the API's HttpOnly cookie and a reload keeps the session (as on
    // lawbid.dev). WEB_URL of lib/env.ts.
    const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3312';
    await prisma.appConfig.upsert({
      where: { key: 'web.allowed_origins' },
      create: { key: 'web.allowed_origins', value: ['https://lawbid.dev', 'https://www.lawbid.dev', webOrigin] },
      update: { value: ['https://lawbid.dev', 'https://www.lawbid.dev', webOrigin] },
    });
    console.log(`admin: ${admin.id} login ${fx.admin.login}`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
