import assert from 'node:assert/strict';
import test from 'node:test';
import { SWITCHES, fetchRemote, resolveSwitches, toEnvLines } from '../resolve-switches.mjs';

const none = Object.fromEntries(SWITCHES.map((s) => [s.env, undefined]));

test('nothing set anywhere: every switch is off (today\'s behaviour)', () => {
  const { values, sources } = resolveSwitches({ remote: null, vars: none });
  for (const s of SWITCHES) assert.equal(values[s.env], '');
  assert.equal(sources.SEO_LLMS, 'variable');
});

test('the repository variables apply where the admin never decided (null)', () => {
  const { values, sources } = resolveSwitches({
    remote: { incremental: null, sitemapIndex: true, robotsAi: null, llms: null, qualityGate: null, rampPerDay: null },
    vars: { ...none, SEO_INCREMENTAL: 'true', SEO_RAMP_PER_DAY: '200', SEO_LLMS: 'false' },
  });
  assert.equal(values.SEO_INCREMENTAL, '1');
  assert.equal(sources.SEO_INCREMENTAL, 'variable');
  assert.equal(values.SEO_RAMP_PER_DAY, '200');
  assert.equal(values.SEO_LLMS, '');
  assert.equal(values.SEO_SITEMAP_INDEX, '1');
  assert.equal(sources.SEO_SITEMAP_INDEX, 'admin');
});

test('an explicit admin OFF beats a repository variable that says true', () => {
  const { values, sources } = resolveSwitches({
    remote: { incremental: false, sitemapIndex: false, robotsAi: false, llms: false, qualityGate: false, rampPerDay: 0 },
    vars: { SEO_INCREMENTAL: 'true', SEO_SITEMAP_INDEX: 'true', SEO_ROBOTS_AI: 'true', SEO_LLMS: 'true', SEO_QUALITY_GATE: 'true', SEO_RAMP_PER_DAY: '500' },
  });
  for (const s of SWITCHES) {
    assert.equal(values[s.env], '', s.env);
    assert.equal(sources[s.env], 'admin');
  }
});

test('a number from the admin is passed on; a wrong type falls back to the variable', () => {
  const a = resolveSwitches({ remote: { rampPerDay: 150, llms: 'yes' }, vars: { SEO_LLMS: '1' } });
  assert.equal(a.values.SEO_RAMP_PER_DAY, '150');
  assert.equal(a.values.SEO_LLMS, '1');
  assert.equal(a.sources.SEO_LLMS, 'variable');
});

test('env lines: one NAME=value per switch', () => {
  const text = toEnvLines(resolveSwitches({ remote: { llms: true }, vars: none }).values);
  assert.match(text, /^SEO_INCREMENTAL=\n/);
  assert.match(text, /\nSEO_LLMS=1\n/);
  assert.equal(text.trim().split('\n').length, SWITCHES.length);
});

test('fetchRemote: ok, HTTP error, network error and a missing API all end in null or the data, never a throw', async () => {
  const ok = await fetchRemote('https://api.test/api/v1/', async (url) => {
    assert.equal(url, 'https://api.test/api/v1/public/seo-settings');
    return { ok: true, json: async () => ({ data: { llms: true } }) };
  });
  assert.deepEqual(ok, { llms: true });
  assert.equal(await fetchRemote('https://api.test', async () => ({ ok: false, status: 503 })), null);
  assert.equal(await fetchRemote('https://api.test', async () => { throw new Error('boom'); }), null);
  assert.equal(await fetchRemote('', async () => assert.fail('no call without an API')), null);
  assert.equal(await fetchRemote('https://api.test', async () => ({ ok: true, json: async () => ({}) })), null);
});
