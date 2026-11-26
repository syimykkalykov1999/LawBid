// Б2 (25.11): canary vs control (SRE Workbook ch. 16). node --test scripts/deploy/canary-compare.test.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { judge, tally } from './canary-compare.mjs';

const line = (release, httpReq, http5xx) => JSON.stringify({ level: 30, metric: 'slo', release, httpReq, http5xx, loginOk: 0 });

test('one bad canary task among many good ones is caught (the fleet average hides it)', () => {
  // 9 old tasks: 900 requests, 1 error; canary: 100 requests, 6 errors. The
  // fleet-wide 5xx share is 7/1000 = 0.7 %, under the 1 % api-5xx-ratio alarm;
  // against the control the canary is 6 % vs 0.11 %.
  const lines = [line('old', 100, 1), ...[...Array(8)].map(() => line('old', 100, 0)), line('new', 100, 6)];
  const side = tally(lines, 'new');
  assert.equal(side.canary.req, 100);
  assert.equal(side.control.req, 900);
  const r = judge(side);
  assert.equal(r.verdict, 'fail');
  assert.match(r.reason, /canary 5xx 6\.00 %/);
});

test('a canary as healthy as the control passes', () => {
  const r = judge(tally([line('old', 1000, 3), line('new', 200, 1)], 'new'));
  assert.equal(r.verdict, 'pass');
});

test('the same errors on both sides (an outside outage) do not fail the canary', () => {
  const r = judge(tally([line('old', 1000, 40), line('new', 200, 9)], 'new'));
  assert.equal(r.verdict, 'pass');
});

test('too little traffic = no verdict, never a false red', () => {
  assert.equal(judge(tally([line('old', 1000, 0), line('new', 10, 5)], 'new')).verdict, 'unknown');
  assert.equal(judge(tally([], 'new')).verdict, 'unknown');
});

test('other lines and broken JSON are skipped', () => {
  const side = tally(['{"metric":"http"}', 'not json', '{"metric":"slo","release":"new"}', line('new', 5, 1)], 'new');
  assert.deepEqual(side.canary, { req: 5, err: 1 });
});

test('CLI: reads the JSON array of `aws logs filter-log-events --query events[].message` and exits 1 on fail', () => {
  const cli = fileURLToPath(new URL('./canary-compare.mjs', import.meta.url));
  const bad = JSON.stringify([line('old', 900, 1), line('new', 100, 8)]);
  assert.throws(() => execFileSync('node', [cli, 'new'], { input: bad }), (e) => e.status === 1 && /fail/.test(String(e.stdout)));
  const ok = execFileSync('node', [cli, 'new', '50', '0.005', '2'], { input: JSON.stringify([line('old', 900, 1), line('new', 100, 0)]) });
  assert.match(String(ok), /pass/);
});
