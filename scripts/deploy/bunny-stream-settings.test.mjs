// node --test scripts/deploy/bunny-stream-settings.test.mjs
// Fixtures: Bunny's Get Video Library answer (VideoLibraryModel, field names from
// https://bunny.net/docs/reference/videolibrarypublic_index2), keys replaced by
// test placeholders.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  compare,
  normList,
  report,
  run,
  updateBody,
  validateDesired,
} from './bunny-stream-settings.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => JSON.parse(readFileSync(join(here, p), 'utf8'));
const desired = () => read('bunny-stream-settings.json');
const same = read('fixtures/bunny/library-same.json');
const drifted = read('fixtures/bunny/library-drift.json');

const silent = { log() {}, error() {} };
const capture = () => {
  const lines = [];
  return { lines, log: (s) => lines.push(s), error: (s) => lines.push(s) };
};
const ENV = { BUNNY_LIBRARY_ID: '123456', BUNNY_ACCOUNT_API_KEY: 'test-account-api-key' };

/** fetch stand-in: answers GETs from `states` in turn, records every call. */
function fakeFetch(...states) {
  const calls = [];
  let i = 0;
  const fn = async (url, init) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body });
    if (init.method === 'POST') return { ok: true, status: 200, json: async () => ({}) };
    const s = states[Math.min(i++, states.length - 1)];
    if (typeof s === 'number') return { ok: false, status: s, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => s };
  };
  fn.calls = calls;
  return fn;
}

test('the declared file is valid and keeps H.264, a low rung and MP4 fallback', () => {
  const d = desired();
  assert.deepEqual(validateDesired(d), []);
  assert.ok(d.outputCodecsByTier['0'].includes('x264'));
  assert.ok(d.outputCodecsByTier['1'].includes('x264'));
  assert.ok(d.outputCodecsByTier['1'].includes('av1'));
  assert.equal(d.settings.EnableMP4Fallback, true);
  assert.equal(d.settings.HasWatermark, false);
});

test('schema: rejects a ladder without H.264, paid codecs on Free, bad rungs', () => {
  const noH264 = desired();
  noH264.outputCodecsByTier['1'] = ['av1'];
  assert.match(validateDesired(noH264).join('|'), /must keep x264/);

  const paidOnFree = desired();
  paidOnFree.outputCodecsByTier['0'] = ['x264', 'av1'];
  assert.match(validateDesired(paidOnFree).join('|'), /tier 0\) has only x264/);

  const onlyHigh = desired();
  onlyHigh.settings.EnabledResolutions = ['1080p', '1440p'];
  const e = validateDesired(onlyHigh).join('|');
  assert.match(e, /at or under 480p/);
  assert.match(e, /at or under 720p/);

  const unknown = desired();
  unknown.settings.EnabledResolutions = ['240p', '4320p'];
  unknown.outputCodecsByTier['1'] = ['x264', 'h266'];
  assert.match(validateDesired(unknown).join('|'), /unknown resolution "4320p".*unknown codec "h266"/);

  const jitOnFree = desired();
  jitOnFree.settings.JitEncodingEnabled = true;
  assert.match(validateDesired(jitOnFree).join('|'), /only on Premium/);

  const badTier = desired();
  badTier.encodingTier = 2;
  assert.match(validateDesired(badTier).join('|'), /encodingTier must be 0/);

  const noBool = desired();
  delete noBool.settings.EnableMP4Fallback;
  assert.match(validateDesired(noBool).join('|'), /EnableMP4Fallback must be true or false/);

  assert.deepEqual(validateDesired(null), ['the file is not a JSON object']);
});

test('lists compare without order or case', () => {
  assert.equal(normList('720p, 240P,1080p,240p'), '240p,720p,1080p');
  assert.equal(normList(['av1', 'x264']), 'av1,x264');
  assert.equal(normList(null), null);
});

test('drift comparator: the recorded library that matches gives no drift', () => {
  assert.deepEqual(compare(desired(), same), []);
});

test('drift comparator: every changed or missing field is reported', () => {
  const drift = compare(desired(), drifted);
  const by = Object.fromEntries(drift.map((x) => [x.field, x]));
  assert.deepEqual(Object.keys(by).sort(), [
    'EnableMP4Fallback',
    'EnabledResolutions',
    'HasWatermark',
    'JitEncodingEnabled',
    'OutputCodecs',
  ]);
  assert.equal(by.EnabledResolutions.have, '360p,720p,1080p,1440p');
  assert.equal(by.EnabledResolutions.want, '240p,360p,480p,720p,1080p');
  assert.equal(by.OutputCodecs.have, 'vp9,x264');
  assert.equal(by.JitEncodingEnabled.have, '(missing)');
});

test('premium tier: the AV1 copy is expected next to H.264', () => {
  const d = desired();
  d.encodingTier = 1;
  const drift = compare(d, same);
  assert.deepEqual(
    drift.map((x) => [x.field, x.want, x.have]),
    [
      ['EncodingTier', 1, 0],
      ['OutputCodecs', 'av1,x264', 'x264'],
    ],
  );
  assert.deepEqual(compare(d, { ...same, EncodingTier: 1, OutputCodecs: 'x264,av1' }), []);
});

test('update body: Bunny field names, comma lists, read-only fields left out', () => {
  assert.deepEqual(updateBody(desired()), {
    EncodingTier: 0,
    OutputCodecs: 'x264',
    EnabledResolutions: '240p,360p,480p,720p,1080p',
    EnableMP4Fallback: true,
    JitEncodingEnabled: false,
  });
});

test('report names the fix for each field and never the keys', () => {
  const text = report(compare(desired(), drifted), desired());
  assert.match(text, /HasWatermark .*Bunny dashboard by hand/);
  assert.match(text, /OutputCodecs .*`apply --yes`/);
  assert.doesNotMatch(text, /test-library-api-key|test-read-only-api-key/);
});

test('check without keys: --soft is a notice (exit 0), plain check exit 2, no call', async () => {
  const f = fakeFetch(same);
  assert.equal(await run(['check', '--soft'], {}, f, silent), 0);
  assert.equal(await run(['check'], {}, f, silent), 2);
  assert.equal(await run(['apply', '--yes'], {}, f, silent), 2);
  assert.equal(f.calls.length, 0);
});

test('check is read-only: one GET with the account key, exit 0 / 1', async () => {
  const ok = fakeFetch(same);
  assert.equal(await run(['check', '--soft'], ENV, ok, silent), 0);
  assert.deepEqual(
    ok.calls.map((c) => [c.method, c.url, c.headers.AccessKey]),
    [['GET', 'https://api.bunny.net/videolibrary/123456', 'test-account-api-key']],
  );
  const bad = fakeFetch(drifted);
  assert.equal(await run(['check', '--soft'], ENV, bad, silent), 1);
  assert.ok(bad.calls.every((c) => c.method === 'GET'));
});

test('check: Bunny unreadable is a failure, and the summary file gets the table', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bunny-'));
  const summary = join(dir, 'summary.md');
  writeFileSync(summary, '');
  assert.equal(await run(['check'], { ...ENV, GITHUB_STEP_SUMMARY: summary }, fakeFetch(401), silent), 1);
  assert.match(readFileSync(summary, 'utf8'), /could not be read: .*HTTP 401/);
  await run(['check'], { ...ENV, GITHUB_STEP_SUMMARY: summary }, fakeFetch(drifted), silent);
  assert.match(readFileSync(summary, 'utf8'), /\| EnabledResolutions \|/);
  assert.doesNotMatch(readFileSync(summary, 'utf8'), /test-account-api-key|test-library-api-key/);
});

test('apply writes nothing without --yes', async () => {
  const f = fakeFetch(drifted);
  const out = capture();
  assert.equal(await run(['apply'], ENV, f, out), 1);
  assert.ok(f.calls.every((c) => c.method === 'GET'));
  assert.match(out.lines.join('\n'), /Nothing written/);
});

test('apply --yes posts the declared values, then checks again', async () => {
  const fixedExceptWatermark = { ...same, HasWatermark: true };
  const f = fakeFetch(drifted, fixedExceptWatermark);
  const out = capture();
  assert.equal(await run(['apply', '--yes'], ENV, f, out), 1); // watermark is by hand
  assert.deepEqual(
    f.calls.map((c) => c.method),
    ['GET', 'POST', 'GET'],
  );
  assert.deepEqual(JSON.parse(f.calls[1].body), updateBody(desired()));
  assert.match(out.lines.at(-1), /HasWatermark/);

  const done = fakeFetch(drifted, same);
  assert.equal(await run(['apply', '--yes'], ENV, done, silent), 0);
});

test('apply with no drift writes nothing', async () => {
  const f = fakeFetch(same);
  assert.equal(await run(['apply', '--yes'], ENV, f, silent), 0);
  assert.deepEqual(f.calls.map((c) => c.method), ['GET']);
});

test('an invalid declared file stops before any call', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bunny-'));
  const file = join(dir, 'bad.json');
  const d = desired();
  d.outputCodecsByTier['0'] = ['av1'];
  writeFileSync(file, JSON.stringify(d));
  const f = fakeFetch(same);
  assert.equal(await run(['check', `--file=${file}`], ENV, f, silent), 1);
  assert.equal(f.calls.length, 0);
  assert.equal(await run(['nope'], ENV, f, silent), 64);
});
