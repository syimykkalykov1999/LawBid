import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PATHS, check, keyVariables, loginMethods, securitySettings } from './asvs-doc-check.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const real = (p) => readFileSync(join(ROOT, p), 'utf8');

test('the documentation in the repository is complete', () => {
  assert.deepEqual(check(real), []);
});

test('a new security setting without a line fails', () => {
  const read = (p) =>
    p === PATHS.settings ? `${real(p)}\n  'security.brand_new_switch': true,\n` : real(p);
  assert.deepEqual(check(read), [
    `setting \`security.brand_new_switch\` has no line in ${PATHS.doc}`,
  ]);
});

test('a new key and a new sign-in method without a line fail', () => {
  const read = (p) => {
    if (p === PATHS.keys) return `${real(p)}\n| \`NEW_SECRET_KEYS\` | x | y |\n`;
    if (p === PATHS.methods)
      return real(p).replace("'passkey';", "'passkey' | 'telegram';");
    return real(p);
  };
  const problems = check(read);
  assert.ok(problems.includes(`key \`NEW_SECRET_KEYS\` has no line in ${PATHS.doc}`));
  assert.ok(problems.includes(`sign-in method \`telegram\` has no line in ${PATHS.doc}`));
});

test('parsers', () => {
  assert.deepEqual(securitySettings("  'security.a': 1,\n  'auth.b_c': '',\n  'web.x': 1,\n"), [
    'auth.b_c',
    'security.a',
  ]);
  assert.deepEqual(keyVariables('| `MESSAGE_ENC_KEYS` + `MESSAGE_ENC_ACTIVE_KID` | x |\n| --- | --- |'), [
    'MESSAGE_ENC_ACTIVE_KID',
    'MESSAGE_ENC_KEYS',
  ]);
  assert.deepEqual(loginMethods("export type LoginMethod =\n  'phone' | 'email';"), ['email', 'phone']);
  // A parser that finds nothing is itself a failure (the source moved).
  assert.ok(check(() => '').some((p) => p.includes('parser no longer matches')));
});
