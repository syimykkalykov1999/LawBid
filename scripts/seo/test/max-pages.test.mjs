import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchAllAttorneys } from '../build.mjs';

test('the directory crawl fails loudly instead of truncating at the page cap', async () => {
  const pages = [
    { data: [1, 2], meta: { nextCursor: 'c1' } },
    { data: [3], meta: { nextCursor: 'c2' } },
    { data: [4], meta: {} },
  ];
  let i = 0;
  const fetchFn = async () => ({ ok: true, json: async () => pages[i++] });
  await assert.rejects(fetchAllAttorneys({ api: 'x', fetchFn, maxPages: 2 }), /raise SEO_MAX_PAGES/);
  i = 0;
  assert.deepEqual(await fetchAllAttorneys({ api: 'x', fetchFn, maxPages: 3 }), [1, 2, 3, 4]);
});
