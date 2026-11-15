// Owner 15.11: the script and Terraform must give the same hash, else «Авто»
// would ask for a code update that is not there (or miss one).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { autoscaleCodeHash, DIRS } from './autoscale-code-hash.mjs';

const sha = (s) => createHash('sha256').update(s).digest('hex');

test('the Terraform formula: sorted "<dir>/<file>:<sha256>" lines, joined by \\n, sha256; no __pycache__', () => {
  const m = mkdtempSync(join(tmpdir(), 'ach-'));
  for (const d of DIRS) {
    mkdirSync(join(m, d, 'lambda', 'tests', '__pycache__'), { recursive: true });
    writeFileSync(join(m, d, 'lambda', 'handler.py'), `print("${d}")\n`);
    writeFileSync(join(m, d, 'lambda', 'tests', 'test_a.py'), 'x = 1\n');
    writeFileSync(join(m, d, 'lambda', 'tests', '__pycache__', 'junk.pyc'), 'junk');
  }
  const lines = [];
  for (const d of DIRS) {
    lines.push(`${d}/handler.py:${sha(`print("${d}")\n`)}`);
    lines.push(`${d}/tests/test_a.py:${sha('x = 1\n')}`);
  }
  assert.equal(autoscaleCodeHash(m), sha(lines.join('\n')));
});

test('one changed byte changes the hash', () => {
  const m = mkdtempSync(join(tmpdir(), 'ach-'));
  for (const d of DIRS) {
    mkdirSync(join(m, d, 'lambda'), { recursive: true });
    writeFileSync(join(m, d, 'lambda', 'handler.py'), 'a');
  }
  const a = autoscaleCodeHash(m);
  writeFileSync(join(m, 'db-autoscale', 'lambda', 'handler.py'), 'b');
  assert.notEqual(autoscaleCodeHash(m), a);
});
