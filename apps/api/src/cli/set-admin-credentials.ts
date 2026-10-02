import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { AdminAuthService } from '../modules/admin-auth/admin-auth.service';

// `npm run admin:set-credentials` (after `nest build`): sets the super
// admin's login + password (and, optionally, the recovery question) from
// environment variables, so nothing secret lives in the repository or in
// shell history:
//   ADMIN_SET_LOGIN, ADMIN_SET_PASSWORD [, ADMIN_SET_QUESTION, ADMIN_SET_ANSWER]
//   SEED_ADMIN_EMAIL picks the account when there is more than one super admin.
// The values are never printed.
async function run(): Promise<void> {
  const login = process.env.ADMIN_SET_LOGIN ?? '';
  const password = process.env.ADMIN_SET_PASSWORD ?? '';
  if (!login || !password) {
    throw new Error('Set ADMIN_SET_LOGIN and ADMIN_SET_PASSWORD.');
  }
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  try {
    const res = await app.get(AdminAuthService).bootstrapSuperAdmin({
      email: process.env.SEED_ADMIN_EMAIL,
      login,
      password,
      question: process.env.ADMIN_SET_QUESTION || undefined,
      answer: process.env.ADMIN_SET_ANSWER || undefined,
    });
    process.stdout.write(
      `Super admin credentials saved (login: ${res.login}). Sessions ended.\n`,
    );
  } finally {
    await app.close();
  }
}

run().then(
  () => process.exit(0),
  (err: unknown) => {
    process.stderr.write(`${err instanceof Error ? err.message : 'failed'}\n`);
    process.exit(1);
  },
);
