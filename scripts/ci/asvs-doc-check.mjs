#!/usr/bin/env node
// STAGE2_SECURITY #20 (ASVS 5.0 documentation requirements, 25.11):
// docs/security/ASVS_DOCUMENTATION.md must name every
//   - `security.*` / `auth.*` admin setting (app-settings.defaults.ts),
//   - encryption key variable of docs/runbooks/KEY_ROTATION.md,
//   - sign-in method of the LoginMethod type (login-method-policy.service.ts).
// A new one without a line in the documentation fails «Repo guards».
//   node scripts/ci/asvs-doc-check.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

export const PATHS = {
  doc: 'docs/security/ASVS_DOCUMENTATION.md',
  settings: 'apps/api/src/common/app-settings/app-settings.defaults.ts',
  keys: 'docs/runbooks/KEY_ROTATION.md',
  methods: 'apps/api/src/modules/auth/services/login-method-policy.service.ts',
};

/** `'security.x': …` / `'auth.y': …` keys at the start of a line. */
export function securitySettings(source) {
  const out = new Set();
  for (const m of source.matchAll(/^\s+'((?:security|auth)\.[a-z0-9_.]+)':/gm)) {
    out.add(m[1]);
  }
  return [...out].sort();
}

/** Upper-case variable names in the first column of the key table. */
export function keyVariables(markdown) {
  const out = new Set();
  for (const line of markdown.split('\n')) {
    if (!line.startsWith('|')) continue;
    const first = line.split('|')[1] ?? '';
    for (const m of first.matchAll(/`([A-Z][A-Z0-9_]{3,})`/g)) out.add(m[1]);
  }
  return [...out].sort();
}

/** The string literals of `export type LoginMethod = … ;`. */
export function loginMethods(source) {
  const m = /export type LoginMethod\s*=([^;]+);/.exec(source);
  if (!m) return [];
  return [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort();
}

/** Names the documentation does not mention (as `name`). */
export function missing(doc, names) {
  return names.filter((n) => !doc.includes(`\`${n}\``));
}

export function check(read) {
  const doc = read(PATHS.doc);
  const problems = [];
  const groups = [
    ['setting', securitySettings(read(PATHS.settings))],
    ['key', keyVariables(read(PATHS.keys))],
    ['sign-in method', loginMethods(read(PATHS.methods))],
  ];
  for (const [kind, names] of groups) {
    if (names.length === 0) problems.push(`no ${kind}s found — the parser no longer matches its source`);
    for (const n of missing(doc, names)) problems.push(`${kind} \`${n}\` has no line in ${PATHS.doc}`);
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = check((p) => readFileSync(join(ROOT, p), 'utf8'));
  if (problems.length > 0) {
    for (const p of problems) console.error(`::error::${p}`);
    process.exit(1);
  }
  console.log('ASVS documentation names every security setting, key and sign-in method');
}
