import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { NO_USER_DATA, compare, pageIds, registryIds } from '../vendors-check.mjs';

const registrySource = readFileSync(
  new URL('../../../apps/api/src/common/secrets/provider-registry.ts', import.meta.url),
  'utf8',
);

test('reads the registry ids (top-level entries only)', () => {
  const ids = registryIds(registrySource);
  assert.ok(ids.length > 20, `only ${ids.length} ids`);
  for (const id of ['stripe', 'cloudflare_r2', 'aws_rekognition', 'persona', 'livekit', 'openai_moderation']) {
    assert.ok(ids.includes(id), id);
  }
  for (const id of Object.keys(NO_USER_DATA)) assert.ok(ids.includes(id), `stale NO_USER_DATA entry ${id}`);
});

test('a provider missing from the page, or a made-up one, is reported', () => {
  const page = 'registry: ["stripe", "twilio"],\n registry: ["nope"]';
  assert.deepEqual(pageIds(page), ['stripe', 'twilio', 'nope']);
  const r = compare(['stripe', 'twilio', 'persona', 'github'], pageIds(page));
  assert.deepEqual(r, { missing: ['persona'], unknown: ['nope'] });
});
