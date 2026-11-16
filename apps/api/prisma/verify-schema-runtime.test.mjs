import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onlyRuntimeTables } from './verify-schema-runtime.mjs';

test('15.11 prod: only _partition_job removed -> not a blocker', () => {
  assert.equal(onlyRuntimeTables('Loaded Prisma config from prisma.config.ts.\n\n[-] Removed tables\n  - _partition_job\n'), true);
});
test('runner work tables are run-time too', () => {
  assert.equal(onlyRuntimeTables('[-] Removed tables\n  - notifications__old\n  - messages__part\n'), true);
});
test('a real removed table still blocks', () => {
  assert.equal(onlyRuntimeTables('[-] Removed tables\n  - _partition_job\n  - users\n'), false);
});
test('any other change still blocks', () => {
  assert.equal(onlyRuntimeTables('[*] Changed the `messages` table\n  [+] Added column `x`\n'), false);
  assert.equal(onlyRuntimeTables('[-] Removed tables\n  - _partition_job\n[+] Added tables\n  - foo\n'), false);
});
test('empty output is not a pass', () => {
  assert.equal(onlyRuntimeTables(''), false);
});
