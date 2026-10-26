import { writeFileSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { unwrapKmsWrappedKeys } from '../common/secrets/kms-env';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Notification deadline per state, in days from discovery, for notice to the
 * person. Sources read 2026-10-25 (secondary: PrivacyRights 50-state survey
 * 2026, Pillsbury / Daily Journal on California SB 446, Perkins Coie 2025
 * update); NOT legal advice: counsel confirms every row. States not listed
 * use "without unreasonable delay" — plan with the strictest (30 days).
 */
export const BREACH_DEADLINE_DAYS: Record<string, number> = {
  CA: 30,
  CO: 30,
  FL: 30,
  NY: 30,
  WA: 30,
  TX: 60,
  CT: 60,
  DE: 60,
  LA: 60,
  SD: 60,
};
export const DEFAULT_DEADLINE_DAYS = 30;

export function deadlineFor(state: string, discovered: Date): Date {
  const days = BREACH_DEADLINE_DAYS[state] ?? DEFAULT_DEADLINE_DAYS;
  return new Date(discovered.getTime() + days * 86_400_000);
}

// `npm run breach:affected -- --from 2026-10-01 --to 2026-10-20
//   --discovered 2026-10-22 [--states NY,FL] [--out /secure/file.csv --with-email]`
// Counts the people whose data existed in the period (account created on or
// before --to and not erased before --from), by state: a client's state, an
// attorney's first license state, else UNKNOWN. Prints counts and the
// deadline per state. --out writes id,state[,email] to a file (mode 0600);
// e-mails are included only with --with-email. Nothing else is printed.
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function run(): Promise<void> {
  await unwrapKmsWrappedKeys();
  const from = new Date(arg('from') ?? '');
  const to = new Date(arg('to') ?? '');
  const discovered = new Date(arg('discovered') ?? new Date().toISOString());
  if (Number.isNaN(+from) || Number.isNaN(+to)) {
    throw new Error('Pass --from YYYY-MM-DD and --to YYYY-MM-DD.');
  }
  const only = arg('states')
    ?.split(',')
    .map((s) => s.trim().toUpperCase());
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  try {
    const prisma = app.get(PrismaService);
    const rows = await prisma.$queryRaw<
      { id: string; state: string; email: string | null }[]
    >`
      SELECT u.id::TEXT AS id,
             COALESCE(cp.state_code, (
               SELECT l.state_code FROM attorney_licenses l
               WHERE l.attorney_id = u.id ORDER BY l.created_at LIMIT 1),
               'UNKNOWN')::TEXT AS state,
             u.email
      FROM users u
      LEFT JOIN client_profiles cp ON cp.user_id = u.id
      WHERE u.created_at <= ${to}
        AND (u.anonymized_at IS NULL OR u.anonymized_at >= ${from})
        AND u.placeholder_kind IS NULL`;
    const picked = rows.filter((r) => !only || only.includes(r.state));
    const byState = new Map<string, number>();
    for (const r of picked)
      byState.set(r.state, (byState.get(r.state) ?? 0) + 1);
    process.stdout.write('state,people,notify_by\n');
    for (const [state, n] of [...byState].sort()) {
      process.stdout.write(
        `${state},${n},${deadlineFor(state, discovered).toISOString().slice(0, 10)}\n`,
      );
    }
    const out = arg('out');
    if (out) {
      const withEmail = process.argv.includes('--with-email');
      const lines = picked.map((r) =>
        withEmail
          ? `${r.id},${r.state},${r.email ?? ''}`
          : `${r.id},${r.state}`,
      );
      writeFileSync(out, `${lines.join('\n')}\n`, { mode: 0o600 });
      process.stdout.write(`${picked.length} rows written to ${out}\n`);
    }
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  run().then(
    () => process.exit(0),
    (err: unknown) => {
      process.stderr.write(
        `${err instanceof Error ? err.message : 'failed'}\n`,
      );
      process.exit(1);
    },
  );
}
