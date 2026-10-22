import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NOTICE_EN,
  protect,
  skipLine,
  splitLine,
  translateDoc,
  unprotect,
} from '../legal-translate.mjs';

// Owner 2026-10-22 (audit #4 §4): the Markdown survives the translation.
test('keeps heading / list markers and translates only the text', () => {
  assert.deepEqual(splitLine('## 3. Payments'), { prefix: '## 3. ', text: 'Payments' });
  assert.deepEqual(splitLine('- **Fees.** You pay'), { prefix: '- ', text: '**Fees.** You pay' });
  assert.deepEqual(splitLine('  1. First'), { prefix: '  1. ', text: 'First' });
});

test('skips blank lines, rules, table separators and bare links', () => {
  for (const t of ['', '---', '|---|---|', 'https://lawbid.app/terms']) assert.equal(skipLine(t), true);
  assert.equal(skipLine('Plain sentence.'), false);
});

test('links, e-mails, placeholders and the brand come back unchanged', () => {
  const s = 'Write to legal@lawbid.app or see [Terms](https://lawbid.app/terms) about {name} & LawBid <b>';
  assert.equal(unprotect(protect(s)), s);
  assert.match(protect(s), /<span translate="no">legal@lawbid.app<\/span>/);
});

test('a document gets the governing-language notice and keeps its structure', async () => {
  const fake = async (q) => q.map((x) => `T(${x})`);
  const out = await translateDoc('# Terms\n\n- One\n\n---\n', 'de', fake);
  const lines = out.split('\n');
  assert.equal(lines[0], `T(_${NOTICE_EN}_)`);
  assert.equal(lines[2], '# T(Terms)');
  assert.equal(lines[4], '- T(One)');
  assert.equal(lines[6], '---');
});
