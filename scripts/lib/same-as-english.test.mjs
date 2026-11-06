import test from 'node:test';
import assert from 'node:assert/strict';
import { findSameAsEnglish, isLanguageNeutral } from './same-as-english.mjs';

const row = (key, en, cells = {}) => ({ key, cells: { en, ...cells } });
const langs = ['en', 'ky', 'de'];

test('flags a cell equal to English, ignoring case and spaces', () => {
  const r = [row('a.b', 'Archive', { ky: ' archive ', de: 'Archiv' })];
  assert.deepEqual(findSameAsEnglish(r, langs), [{ key: 'a.b', lang: 'ky' }]);
});

test('flags an empty cell', () => {
  assert.deepEqual(findSameAsEnglish([row('a.b', 'Archive', { ky: '', de: 'Archiv' })], langs), [{ key: 'a.b', lang: 'ky' }]);
});

test('numbers, symbols, placeholders-only, URLs are neutral', () => {
  for (const s of ['{n}', '12:30', '🙂', 'https://x.io/a', 'a@b.io']) assert.equal(isLanguageNeutral(s), true, s);
  assert.equal(isLanguageNeutral('Archive'), false);
});

test('allow list: by value and per language', () => {
  const r = [row('brand', 'LawBid', { ky: 'LawBid', de: 'LawBid' }), row('x.video', 'Video', { ky: 'Видео', de: 'Video' })];
  const allow = { values: ['lawbid'], perLanguage: { de: ['x.video'] } };
  assert.deepEqual(findSameAsEnglish(r, langs, allow), []);
  assert.deepEqual(findSameAsEnglish(r, langs, {}).length, 3);
});
