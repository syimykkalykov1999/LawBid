#!/usr/bin/env node
// Docs say the truth about the migration DB user (OPEN_ITEMS_SWEEP 2026-11-09
// C-c9; D8 26.11). The truth is the admin switch aws.db_migrator_role, i.e.
// `db_migrator_role_enabled` in infra/envs/prod/growth.auto.tfvars.json (the
// infra-apply workflow commits that file to main after every apply):
//   true          -> the schema steps of the migrate task run as lawbid_migrator
//                    (prisma/ensure-migrator-role.mjs, docs/runbooks/db-migrator-role.md);
//   false/missing -> they run as lawbid_admin, the RDS master user (as before).
// Every operational document that names the user migrations run under must
// name the truth; a line that names the other role must name the switch in
// the same line (db_migrator_role), i.e. say it depends on it. «План / not in
// use» no longer excuses a line: it would turn false the day the switch is on.
// History (CHANGELOG, changelog.d, journal) is not checked.
//
//   node scripts/ci/migration-role-check.mjs [--root <repo>] [--tfvars <file>]
//
// Exit 1 with the offending file:line when the docs diverge again.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const root = opt('--root', process.cwd());
const tfvarsFile = opt('--tfvars', join(root, 'infra/envs/prod/growth.auto.tfvars.json'));

export const ROLES = ['lawbid_admin', 'lawbid_migrator'];
export const MARKERS = /db_migrator_role/;


/** The role the migrations run under, from the parsed growth.auto.tfvars.json. */
export function truthOf(tfvars) {
  return tfvars && tfvars.db_migrator_role_enabled === true ? 'lawbid_migrator' : 'lawbid_admin';
}

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
  const truth = truthOf(JSON.parse(readFileSync(tfvarsFile, 'utf8')));
  const read = (f) => (existsSync(join(root, f)) ? readFileSync(join(root, f), 'utf8') : null);
  const problems = check(FILES, truth, read);
  for (const p of problems) console.error(`::error title=Migration user in docs::${p}`);
  if (problems.length) {
    console.error(`Миграции на проде идут под ${truth} (переключатель aws.db_migrator_role, db_migrator_role_enabled в infra/envs/prod/growth.auto.tfvars.json). Исправьте документ: назовите ${truth} или напишите в той же строке, что роль зависит от переключателя db_migrator_role.`);
    process.exit(1);
  }
  console.log(`migration-role-check: every operational doc names ${truth} as the migration user`);
}
