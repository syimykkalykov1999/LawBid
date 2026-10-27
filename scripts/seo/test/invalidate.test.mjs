import assert from 'node:assert/strict';
import { test } from 'node:test';
import { capPaths, invalidateWithBackoff, isLimitError } from '../lib/invalidate.mjs';
import { pickInvalidations } from '../lib/manifest.mjs';

const busy = () => new Error('An error occurred (TooManyInvalidationsInProgress): You have exceeded the maximum number of in-progress wildcard invalidations');

test('capPaths keeps at most 10 wildcards, exact paths do not count, order is the priority', () => {
  const wild = Array.from({ length: 14 }, (_, i) => `/f${i}/*`);
  const r = capPaths(['/sitemap.xml', ...wild, '/robots.txt']);
  assert.equal(r.paths.filter((p) => p.includes('*')).length, 10);
  assert.deepEqual(r.paths.slice(0, 3), ['/sitemap.xml', '/f0/*', '/f1/*']);
  assert.ok(r.paths.includes('/robots.txt'));
  assert.equal(r.dropped, 4);
  assert.equal(capPaths(['/a/*', '/b'], { maxWildcards: 0 }).paths.join(), '/b');
});

test('capPaths caps the total and drops duplicates', () => {
  const r = capPaths([...Array.from({ length: 40 }, (_, i) => `/p${i}`), '/p0'], { maxPaths: 30 });
  assert.equal(r.paths.length, 30);
  assert.equal(new Set(r.paths).size, 30);
});

test('the incremental plan never makes a wildcard, over the budget the rest waits', () => {
  const changed = Array.from({ length: 80 }, (_, i) => `attorneys/u${i}/index.html`);
  const r = pickInvalidations({ changed, removed: [], max: 30, exactOnly: true });
  assert.equal(r.paths.length, 30);
  assert.ok(r.paths.every((p) => !p.includes('*')));
  assert.ok(r.skipped > 0);
});

test('isLimitError recognises the CloudFront message', () => {
  assert.equal(isLimitError(busy().message), true);
  assert.equal(isLimitError('AccessDenied'), false);
});

test('backoff: free CloudFront creates at once, no waiting', async () => {
  const waits = [];
  const r = await invalidateWithBackoff({ paths: ['/a'], inProgress: async () => 0, create: async () => {}, sleep: async (ms) => waits.push(ms) });
  assert.deepEqual(r, { status: 'created', attempts: 1 });
  assert.deepEqual(waits, []);
});

test('backoff: waits while many resets run, then creates', async () => {
  const counts = [12, 11, 3];
  const waits = [];
  let created = 0;
  const r = await invalidateWithBackoff({ paths: ['/a'], inProgress: async () => counts.shift(), create: async () => { created++; }, sleep: async (ms) => waits.push(ms) });
  assert.deepEqual(r, { status: 'created', attempts: 3 });
  assert.equal(waits.length, 2);
  assert.equal(created, 1);
});

test('backoff: the limit error of create is waited out, three tries then a skip (no throw)', async () => {
  let tries = 0;
  const waits = [];
  const r = await invalidateWithBackoff({
    paths: ['/a/*'],
    inProgress: async () => 0,
    create: async () => { tries++; throw busy(); },
    sleep: async (ms) => waits.push(ms),
  });
  assert.deepEqual(r, { status: 'skipped', attempts: 3 });
  assert.equal(tries, 3);
  assert.equal(waits.length, 2);
});

test('backoff: an unknown count (no list permission) falls back to the create error; other errors are thrown', async () => {
  const ok = await invalidateWithBackoff({ paths: ['/a'], inProgress: async () => { throw new Error('AccessDenied'); }, create: async () => {}, sleep: async () => {} });
  assert.equal(ok.status, 'created');
  await assert.rejects(
    invalidateWithBackoff({ paths: ['/a'], inProgress: async () => 0, create: async () => { throw new Error('NoSuchDistribution'); }, sleep: async () => {} }),
    /NoSuchDistribution/,
  );
});

test('backoff: nothing to reset is not an error', async () => {
  const r = await invalidateWithBackoff({ paths: [], inProgress: async () => 99, create: async () => { throw new Error('no'); }, sleep: async () => {} });
  assert.equal(r.status, 'nothing');
});
