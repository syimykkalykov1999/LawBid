#!/usr/bin/env node
// Docs say the truth about the migration DB user (OPEN_ITEMS_SWEEP 2026-11-09
// C-c9). The one source of truth is infra/postgres/migration-role.txt (today
// `lawbid_admin`: the RDS master user in the secret MIGRATOR_DATABASE_URL, the
// owner of every table; `lawbid_migrator` is the planned least-privilege role
// that is NOT used yet — docs/runbooks/TF_CATCHUP.md «Про пользователя
// миграций»). Every operational document that names the user migrations run
// under must name the truth; a line that mentions the other role must say in
// the same line that it is planned / not in use (план, planned, не
// используется, not used, not in use, вместо, instead). History (CHANGELOG,
// changelog.d, journal) is not checked.
//
//   node scripts/ci/migration-role-check.mjs [--root <repo>] [--truth <file>]
//
// Exit 1 with the offending file:line when the docs diverge again.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const root = opt('--root', process.cwd());
const truthFile = opt('--truth', join(root, 'infra/postgres/migration-role.txt'));

export const ROLES = ['lawbid_admin', 'lawbid_migrator'];
export const MARKERS = /план|planned|не используется|not used|not in use|вместо|instead|не чинить|do not fix/i;
export const FILES = [
  'docs/02_DATABASE.md',
  'docs/06_PRODUCTION.md',
  'docs/runbooks/DEPLOY_PROD.md',
  'docs/runbooks/PROD_LAUNCH.md',
  'docs/runbooks/TF_CATCHUP.md',
  'docs/runbooks/db-ops.md',
  'infra/README.md',
  'infra/modules/ecs/main.tf',
  'scripts/deploy/run-migrations.sh',
  'scripts/deploy/prod-db-setup.sh',
  '.github/workflows/deploy.yml',
];

/** Lines that talk about migrations AND name a role. */
const MIGRATION_WORDS = /migrat|миграци|MIGRATOR_DATABASE_URL|prisma migrate/i;

export function check(files, truth, read) {
  const problems = [];
  let mentions = 0;
  for (const file of files) {
    const text = read(file);
    if (text == null) continue;
    text.split('\n').forEach((line, i) => {
      const named = ROLES.filter((r) => line.includes(r));
      // the role names themselves contain "migrat": judge the rest of the line
      const rest = ROLES.reduce((l, r) => l.split(r).join(''), line);
      if (named.length === 0 || !MIGRATION_WORDS.test(rest)) return;
      mentions += 1;
      const other = named.filter((r) => r !== truth);
      if (other.length > 0 && !line.includes(truth) && !MARKERS.test(line)) {
        problems.push(`${file}:${i + 1}: names ${other.join('/')} as the migration user; the truth is ${truth} (${line.trim().slice(0, 120)})`);
      }
    });
  }
  if (mentions === 0) problems.push('no document names the migration user at all — the check would be blind');
  return problems;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const truth = readFileSync(truthFile, 'utf8').trim();
  if (!ROLES.includes(truth)) { console.error(`::error::${truthFile}: unknown role "${truth}"`); process.exit(2); }
  const read = (f) => (existsSync(join(root, f)) ? readFileSync(join(root, f), 'utf8') : null);
  const problems = check(FILES, truth, read);
  for (const p of problems) console.error(`::error title=Migration user in docs::${p}`);
  if (problems.length) {
    console.error(`Миграции на проде идут под ${truth} (infra/postgres/migration-role.txt). Исправьте документ или, если роль действительно сменилась, этот файл.`);
    process.exit(1);
  }
  console.log(`migration-role-check: every operational doc names ${truth} as the migration user`);
}
