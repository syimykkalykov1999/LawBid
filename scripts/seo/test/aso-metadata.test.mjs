// Owner 2026-10-27 (ASO package): the store texts in docs/aso (drafts) and
// in the fastlane folders (live) stay inside the stores' limits and free of
// the words the attorney-advertising rules forbid (plan §6).
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8').replace(/\n$/, '');

const IOS_LIMITS = { name: 30, subtitle: 30, keywords: 100, promotional_text: 170, description: 4000 };
const PLAY_LIMITS = { title: 30, short_description: 80, full_description: 4000 };

const SETS = [
  ['draft App Store', 'docs/aso/app-store/en-US/', IOS_LIMITS],
  ['draft Google Play', 'docs/aso/google-play/en-US/', PLAY_LIMITS],
  ['live App Store', 'apps/mobile/ios/fastlane/metadata/en-US/', IOS_LIMITS],
  ['live Google Play', 'apps/mobile/android/fastlane/metadata/android/en-US/', PLAY_LIMITS],
];

// Words the listing must not use (New York Rule 7.1, plan §6).
const FORBIDDEN = [
  /\bbest\b/i,
  /\btop[- ](?:rated|ranked|lawyers?|attorneys?)\b/i,
  /#\s?1\b/,
  /\bleading\b/i,
  /(?<!not )\bguarantee[sd]?\b/i, // "does not guarantee any result" is the disclaimer
  /we will win/i,
  /\blowest\b/i,
  /\bcheap(?:est)?\b/i,
  /\bspecialists?\b/i,
  /\bexperts?\b/i,
  /free consultation/i,
];

for (const [label, dir, limits] of SETS) {
  test(`${label}: lengths are inside the store limits`, () => {
    for (const [file, max] of Object.entries(limits)) {
      if (!existsSync(new URL(`${dir}${file}.txt`, root))) continue;
      const text = read(`${dir}${file}.txt`);
      assert.ok(text.length > 0, `${dir}${file}.txt is empty`);
      assert.ok(text.length <= max, `${dir}${file}.txt is ${text.length} characters, limit ${max}`);
    }
  });
}

for (const [label, dir] of SETS.slice(0, 2)) {
  test(`${label}: no forbidden advertising words`, () => {
    const files = label.includes('App Store')
      ? ['name', 'subtitle', 'keywords', 'promotional_text', 'description']
      : ['title', 'short_description', 'full_description'];
    for (const file of files) {
      const text = read(`${dir}${file}.txt`);
      for (const re of FORBIDDEN) assert.ok(!re.test(text), `${dir}${file}.txt matches ${re}`);
    }
  });
}

test('draft keywords: comma-separated, no spaces, no word of the name or subtitle', () => {
  const kw = read('docs/aso/app-store/en-US/keywords.txt');
  assert.ok(!/\s/.test(kw), 'no spaces in the keyword field');
  const list = kw.split(',');
  assert.equal(new Set(list).size, list.length, 'no duplicates');
  const own = new Set(
    `${read('docs/aso/app-store/en-US/name.txt')} ${read('docs/aso/app-store/en-US/subtitle.txt')}`
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
  for (const k of list) assert.ok(!own.has(k), `"${k}" is already in the name or subtitle`);
});

test('draft descriptions say it is not a law firm', () => {
  for (const f of ['docs/aso/app-store/en-US/description.txt', 'docs/aso/google-play/en-US/full_description.txt']) {
    assert.match(read(f), /not a law firm/i, f);
  }
});

test('the checklist defines both admin keys', () => {
  const md = read('docs/aso/CHECKLIST.md');
  assert.match(md, /`seo\.checklist\.app_store`/);
  assert.match(md, /`seo\.checklist\.play_store`/);
});
